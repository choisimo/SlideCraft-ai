# Worker Convert Service Implementation

## Overview
The Worker Convert service handles the conversion of uploaded files (PPTX, PDF, DOCX) into normalized Deck JSON format for the collaborative editor, with asset extraction and storage management.

## Service Responsibilities
- Process conversion jobs from the job queue
- Parse PPTX, PDF, and DOCX files into structured data
- Extract and store assets (images, fonts, embedded media)
- Generate normalized Deck JSON schema
- Emit progress events during conversion
- Handle conversion errors and retry logic
- Store conversion results in database and storage backend

## Tech Stack
- **Runtime**: Python 3.11+
- **Task Queue**: Celery with Redis/RabbitMQ broker
- **Document Parsing**: 
  - PPTX: `python-pptx` + `Pillow` (PIL)
  - PDF: `PyMuPDF` (fitz) + `pdfplumber`
  - DOCX: `python-docx`
- **Storage**: Pluggable backend integration (Local/S3/Google Drive)
- **Database**: PostgreSQL with `psycopg2`
- **Observability**: OpenTelemetry, structured logging
- **Image Processing**: `Pillow`, `opencv-python` (optional)

## Conversion Architecture

### Job Input Schema
```python
@dataclass
class ConvertJobPayload:
    job_id: str
    user_id: str
    object_key: str  # Storage path to original file
    source_type: Literal["pptx", "pdf", "docx"]
    document_title: Optional[str] = None
    options: Dict[str, Any] = None
```

### Normalized Deck Schema
```python
@dataclass
class DeckSchema:
    version: str = "1.0"
    metadata: DeckMetadata
    slides: List[SlideSchema]
    assets: Dict[str, AssetSchema]
    styles: StyleDefinitions

@dataclass
class SlideSchema:
    id: str
    title: Optional[str]
    elements: List[ElementSchema]
    layout: LayoutSchema
    notes: Optional[str]
    
@dataclass  
class ElementSchema:
    id: str
    type: Literal["text", "image", "shape", "table"]
    position: Position
    size: Size
    properties: Dict[str, Any]
```

## File Parsers

### PPTX Parser
```python
class PPTXParser:
    def parse(self, file_path: str) -> DeckSchema:
        presentation = Presentation(file_path)
        
        slides = []
        assets = {}
        
        for slide_idx, slide in enumerate(presentation.slides):
            slide_elements = []
            
            # Extract text boxes
            for shape in slide.shapes:
                if shape.has_text_frame:
                    element = self._parse_text_element(shape)
                    slide_elements.append(element)
                
                # Extract images
                elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    asset_id = self._extract_image(shape, assets)
                    element = self._create_image_element(shape, asset_id)
                    slide_elements.append(element)
                    
                # Extract other shapes
                else:
                    element = self._parse_shape_element(shape)
                    slide_elements.append(element)
            
            slides.append(SlideSchema(
                id=f"slide_{slide_idx}",
                elements=slide_elements,
                layout=self._extract_layout(slide),
                notes=self._extract_notes(slide)
            ))
            
        return DeckSchema(slides=slides, assets=assets)
```

### PDF Parser  
```python
class PDFParser:
    def parse(self, file_path: str) -> DeckSchema:
        doc = fitz.open(file_path)
        slides = []
        assets = {}
        
        for page_num in range(doc.page_count):
            page = doc[page_num]
            
            # Extract text blocks with positioning
            text_elements = self._extract_text_blocks(page)
            
            # Extract images
            image_elements = []
            for img_index, img in enumerate(page.get_images()):
                asset_id = self._extract_pdf_image(doc, img, assets)
                element = self._create_image_element_from_pdf(img, asset_id)
                image_elements.append(element)
            
            slides.append(SlideSchema(
                id=f"slide_{page_num}",
                elements=text_elements + image_elements,
                layout=self._create_default_layout()
            ))
            
        doc.close()
        return DeckSchema(slides=slides, assets=assets)
```

### DOCX Parser
```python
class DOCXParser:
    def parse(self, file_path: str) -> DeckSchema:
        doc = Document(file_path)
        slides = []
        assets = {}
        current_slide_elements = []
        
        for paragraph in doc.paragraphs:
            # Split by headings (H1, H2 create new slides)
            if paragraph.style.name.startswith('Heading'):
                if current_slide_elements:
                    slides.append(self._create_slide_from_elements(current_slide_elements))
                    current_slide_elements = []
                
                # Start new slide with heading as title
                current_slide_elements.append(
                    self._create_title_element(paragraph.text)
                )
            else:
                # Regular paragraph content
                current_slide_elements.append(
                    self._create_text_element(paragraph)
                )
        
        # Add final slide
        if current_slide_elements:
            slides.append(self._create_slide_from_elements(current_slide_elements))
            
        return DeckSchema(slides=slides, assets=assets)
```

## Asset Management

### Asset Extraction
```python
class AssetManager:
    def __init__(self, storage_backend: StorageBackend):
        self.storage = storage_backend
        
    def extract_and_store_asset(self, 
                               asset_data: bytes, 
                               asset_type: str,
                               job_id: str) -> str:
        """Extract asset and store in configured backend"""
        
        asset_id = f"asset_{uuid4().hex}"
        asset_path = f"assets/{job_id}/{asset_id}.{asset_type}"
        
        # Store in configured backend (Local/S3/GDrive)
        storage_url = self.storage.store(asset_path, asset_data)
        
        return asset_id, storage_url
```

### Asset Optimization
```python
class ImageOptimizer:
    def optimize_image(self, image_data: bytes) -> bytes:
        """Optimize images for web display"""
        with Image.open(BytesIO(image_data)) as img:
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
                
            # Resize if too large
            max_size = (1920, 1080)
            if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Compress
            output = BytesIO()
            img.save(output, format='JPEG', quality=85, optimize=True)
            return output.getvalue()
```

## Job Processing Pipeline

### Main Worker Implementation
```python
@celery_app.task(bind=True, max_retries=3)
def convert_document(self, job_payload: dict):
    """Main conversion task"""
    try:
        job_id = job_payload['job_id']
        
        # Update job status
        self.update_job_status(job_id, 'running', 0, 'Starting conversion')
        
        # Download source file
        source_file = self.download_source_file(job_payload['object_key'])
        self.update_job_status(job_id, 'running', 20, 'File downloaded')
        
        # Parse document
        parser = self.get_parser(job_payload['source_type'])
        deck = parser.parse(source_file)
        self.update_job_status(job_id, 'running', 60, 'Document parsed')
        
        # Store assets
        self.store_assets(deck.assets, job_id)
        self.update_job_status(job_id, 'running', 80, 'Assets stored')
        
        # Save deck to database
        self.save_deck_to_db(job_id, deck)
        self.update_job_status(job_id, 'succeeded', 100, 'Conversion completed')
        
        # Cleanup temp files
        os.unlink(source_file)
        
    except Exception as exc:
        logger.exception(f"Conversion failed for job {job_id}")
        self.update_job_status(job_id, 'failed', None, str(exc))
        
        # Retry logic
        if self.request.retries < self.max_retries:
            raise self.retry(countdown=2 ** self.request.retries)
```

### Progress Reporting
```python
class ProgressReporter:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.redis_client = redis.Redis()
        
    def update_progress(self, status: str, progress: int, message: str):
        """Update job progress and publish to realtime channel"""
        
        # Update database
        update_job_status(self.job_id, status, progress, message)
        
        # Publish to realtime channel
        event = {
            'type': 'job.update',
            'jobId': self.job_id,
            'status': status,
            'progress': progress,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        channel = f"jobs.{self.job_id}"
        self.redis_client.publish(channel, json.dumps(event))
```

## Error Handling & Retries

### Retry Strategy
```python
# Exponential backoff with jitter
@celery_app.task(bind=True, 
                autoretry_for=(IOError, ConnectionError),
                retry_backoff=True,
                retry_jitter=True,
                max_retries=3)
def convert_with_retry(self, job_payload):
    # Conversion logic with automatic retries
    pass
```

### Error Categories
```python
class ConversionError(Exception):
    """Base conversion error"""
    pass

class UnsupportedFormatError(ConversionError):
    """File format not supported"""
    pass

class CorruptedFileError(ConversionError):
    """File is corrupted or unreadable"""
    pass

class StorageError(ConversionError):
    """Storage backend error"""
    pass
```

## Database Integration

### Deck Storage
```python
def save_deck_to_database(job_id: str, deck: DeckSchema):
    """Save converted deck to PostgreSQL"""
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Serialize deck to JSON
        deck_json = asdict(deck)
        
        cursor.execute("""
            INSERT INTO decks (document_id, content, created_at)
            VALUES (%(job_id)s, %(content)s, NOW())
            ON CONFLICT (document_id) 
            DO UPDATE SET content = %(content)s, updated_at = NOW()
        """, {
            'job_id': job_id,
            'content': json.dumps(deck_json)
        })
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        raise StorageError(f"Failed to save deck: {str(e)}")
    finally:
        cursor.close()
        conn.close()
```

## Testing Strategy

### Unit Tests
```python
class TestPPTXParser:
    def test_parse_simple_presentation(self):
        parser = PPTXParser()
        deck = parser.parse('tests/fixtures/simple.pptx')
        
        assert len(deck.slides) == 3
        assert deck.slides[0].title == "Welcome"
        assert len(deck.assets) > 0

class TestConversionWorker:
    def test_conversion_job_success(self):
        job_payload = {
            'job_id': 'test-job-123',
            'source_type': 'pptx',
            'object_key': 'test/sample.pptx'
        }
        
        result = convert_document.apply(args=[job_payload])
        assert result.successful()
```

### Integration Tests
```python
def test_end_to_end_conversion():
    """Test complete conversion pipeline"""
    
    # Upload test file
    upload_result = upload_test_file('sample.pptx')
    
    # Trigger conversion
    job_id = trigger_conversion(upload_result.object_key, 'pptx')
    
    # Wait for completion
    job_status = wait_for_job_completion(job_id, timeout=30)
    
    # Verify results
    assert job_status.status == 'succeeded'
    
    # Check database
    deck = get_deck_from_db(job_id)
    assert deck is not None
    assert len(deck['slides']) > 0
```

### Fidelity Testing
```python
def test_conversion_fidelity():
    """Test conversion maintains acceptable fidelity"""
    
    test_cases = [
        ('text_heavy.pptx', validate_text_preservation),
        ('image_heavy.pdf', validate_image_extraction),
        ('structured.docx', validate_heading_structure)
    ]
    
    for filename, validator in test_cases:
        deck = convert_test_file(filename)
        fidelity_score = validator(deck)
        assert fidelity_score > 0.85  # 85% fidelity threshold
```

## Performance Optimization

### Memory Management
```python
class MemoryEfficientParser:
    def parse_large_pdf(self, file_path: str) -> DeckSchema:
        """Parse large PDFs without loading entire file into memory"""
        
        doc = fitz.open(file_path)
        slides = []
        
        # Process pages one at a time
        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            slide = self.parse_page(page)
            slides.append(slide)
            page.close()  # Free page memory
            
        doc.close()
        return DeckSchema(slides=slides)
```

### Concurrent Processing
```python
@celery_app.task
def parallel_asset_processing(assets_data: List[dict]) -> List[str]:
    """Process multiple assets in parallel"""
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [
            executor.submit(process_single_asset, asset)
            for asset in assets_data
        ]
        
        results = [future.result() for future in futures]
    
    return results
```

## Monitoring & Observability

### Metrics Collection
```python
from prometheus_client import Counter, Histogram, Gauge

# Conversion metrics
CONVERSIONS_TOTAL = Counter('conversions_total', ['source_type', 'status'])
CONVERSION_DURATION = Histogram('conversion_duration_seconds', ['source_type'])
QUEUE_SIZE = Gauge('conversion_queue_size')
ASSET_PROCESSING_TIME = Histogram('asset_processing_seconds', ['asset_type'])

@celery_app.task
def instrumented_convert(job_payload):
    start_time = time.time()
    source_type = job_payload['source_type']
    
    try:
        result = convert_document(job_payload)
        CONVERSIONS_TOTAL.labels(source_type=source_type, status='success').inc()
        return result
    except Exception as e:
        CONVERSIONS_TOTAL.labels(source_type=source_type, status='failure').inc()
        raise
    finally:
        duration = time.time() - start_time
        CONVERSION_DURATION.labels(source_type=source_type).observe(duration)
```

### Structured Logging
```python
import structlog

logger = structlog.get_logger()

def log_conversion_start(job_id: str, source_type: str, file_size: int):
    logger.info(
        "conversion_started",
        job_id=job_id,
        source_type=source_type,
        file_size_bytes=file_size
    )
```

## Deployment Configuration

### Docker Configuration
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libffi-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as non-root user
RUN useradd -m celery
USER celery

CMD ["celery", "worker", "-A", "worker.convert", "--loglevel=info"]
```

### Environment Configuration
```bash
# Queue configuration
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Database
DATABASE_URL=postgresql://user:pass@db:5432/slidecraft

# Storage backend
STORAGE_PROVIDER=s3
S3_BUCKET=slidecraft-assets
S3_REGION=us-east-1

# Performance tuning
CELERY_WORKER_CONCURRENCY=4
CELERY_TASK_TIME_LIMIT=300
CELERY_TASK_SOFT_TIME_LIMIT=240

# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=INFO
```

## Future Enhancements

### Planned Improvements
- Advanced OCR for scanned PDFs using Tesseract
- Font embedding and preservation
- Animation and transition extraction from PPTX
- Table structure preservation and enhancement
- Chart and diagram recognition
- Multi-language text detection and processing
- Incremental conversion for large documents
- Conversion result caching and deduplication