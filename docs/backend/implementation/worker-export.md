# Worker Export Service Implementation

## Overview
The Worker Export service converts normalized Deck JSON back to presentation formats (PPTX, PDF) for download, maintaining layout fidelity and supporting various output options.

## Service Responsibilities
- Process export jobs from the job queue
- Convert Deck JSON to PPTX using python-pptx
- Generate PDF exports via headless browser or ReportLab
- Handle asset retrieval and embedding
- Apply export options (page size, quality, notes inclusion)
- Generate signed download URLs
- Emit progress events during export
- Handle export errors and cleanup

## Tech Stack
- **Runtime**: Python 3.11+
- **Task Queue**: Celery with Redis/RabbitMQ broker
- **PPTX Generation**: `python-pptx`
- **PDF Generation**: 
  - Option A: Puppeteer (Chrome headless) via `pyppeteer`
  - Option B: ReportLab for programmatic PDF creation
- **Storage**: Pluggable backend integration (Local/S3/Google Drive)
- **Database**: PostgreSQL with `psycopg2`
- **Image Processing**: `Pillow` for asset manipulation
- **Observability**: OpenTelemetry, structured logging

## Export Architecture

### Job Input Schema
```python
@dataclass
class ExportJobPayload:
    job_id: str
    user_id: str
    document_id: str
    format: Literal["pptx", "pdf"]
    options: ExportOptions = None

@dataclass
class ExportOptions:
    # PPTX options
    include_notes: bool = True
    preserve_animations: bool = False
    master_template: Optional[str] = None
    
    # PDF options
    page_size: str = "A4"  # A4, Letter, Custom
    orientation: str = "landscape"  # portrait, landscape
    quality: str = "high"  # low, medium, high
    include_slide_numbers: bool = True
    
    # Common options
    start_slide: int = 1
    end_slide: Optional[int] = None
```

### Export Result Schema
```python
@dataclass
class ExportResult:
    job_id: str
    document_id: str
    format: str
    file_path: str  # Storage backend path
    file_size: int
    download_url: str  # Signed URL
    expires_at: datetime
    metadata: Dict[str, Any]
```

## PPTX Export Implementation

### Main PPTX Exporter
```python
class PPTXExporter:
    def __init__(self, storage_backend: StorageBackend):
        self.storage = storage_backend
        
    def export(self, deck: DeckSchema, options: ExportOptions) -> str:
        """Convert Deck JSON to PPTX file"""
        
        # Create presentation
        prs = Presentation()
        
        # Remove default slide
        if len(prs.slides) > 0:
            delete_slide(prs, 0)
        
        # Process each slide
        for slide_data in deck.slides:
            slide = self._create_slide(prs, slide_data, deck.assets, options)
            
        # Apply master template if specified
        if options.master_template:
            self._apply_master_template(prs, options.master_template)
            
        # Save to temporary file
        temp_path = f"/tmp/export_{uuid4().hex}.pptx"
        prs.save(temp_path)
        
        return temp_path
    
    def _create_slide(self, 
                     prs: Presentation, 
                     slide_data: SlideSchema,
                     assets: Dict[str, AssetSchema],
                     options: ExportOptions) -> Slide:
        """Create a single slide from slide data"""
        
        # Add slide with blank layout
        slide_layout = prs.slide_layouts[6]  # Blank layout
        slide = prs.slides.add_slide(slide_layout)
        
        # Add elements
        for element in slide_data.elements:
            if element.type == "text":
                self._add_text_element(slide, element)
            elif element.type == "image":
                self._add_image_element(slide, element, assets)
            elif element.type == "shape":
                self._add_shape_element(slide, element)
            elif element.type == "table":
                self._add_table_element(slide, element)
                
        # Add notes if enabled
        if options.include_notes and slide_data.notes:
            slide.notes_slide.notes_text_frame.text = slide_data.notes
            
        return slide
```

### Element Rendering
```python
class ElementRenderer:
    def add_text_element(self, slide: Slide, element: ElementSchema):
        """Add text box to slide"""
        
        # Convert position from normalized to EMU units
        left = Inches(element.position.x)
        top = Inches(element.position.y)
        width = Inches(element.size.width)
        height = Inches(element.size.height)
        
        # Add text box
        textbox = slide.shapes.add_textbox(left, top, width, height)
        text_frame = textbox.text_frame
        
        # Set content
        text_frame.text = element.properties.get('text', '')
        
        # Apply formatting
        self._apply_text_formatting(text_frame, element.properties)
        
    def add_image_element(self, 
                         slide: Slide, 
                         element: ElementSchema, 
                         assets: Dict[str, AssetSchema]):
        """Add image to slide"""
        
        asset_id = element.properties.get('asset_id')
        if not asset_id or asset_id not in assets:
            return
            
        # Download asset from storage
        asset = assets[asset_id]
        image_data = self.storage.download(asset.storage_path)
        
        # Add to slide
        left = Inches(element.position.x)
        top = Inches(element.position.y)
        
        with BytesIO(image_data) as image_stream:
            slide.shapes.add_picture(image_stream, left, top)
            
    def _apply_text_formatting(self, text_frame: TextFrame, properties: Dict):
        """Apply text formatting from properties"""
        
        paragraph = text_frame.paragraphs[0]
        
        # Font settings
        font = paragraph.runs[0].font
        font.name = properties.get('font_family', 'Calibri')
        font.size = Pt(properties.get('font_size', 18))
        font.bold = properties.get('bold', False)
        font.italic = properties.get('italic', False)
        
        # Color
        if 'color' in properties:
            font.color.rgb = RGBColor.from_string(properties['color'])
            
        # Alignment
        alignment_map = {
            'left': PP_ALIGN.LEFT,
            'center': PP_ALIGN.CENTER,
            'right': PP_ALIGN.RIGHT
        }
        paragraph.alignment = alignment_map.get(
            properties.get('text_align', 'left'), 
            PP_ALIGN.LEFT
        )
```

## PDF Export Implementation

### Puppeteer-based PDF Export
```python
class PuppeteerPDFExporter:
    def __init__(self, storage_backend: StorageBackend):
        self.storage = storage_backend
        
    async def export(self, deck: DeckSchema, options: ExportOptions) -> str:
        """Convert Deck JSON to PDF via headless browser"""
        
        # Generate HTML for slides
        html_content = self._generate_html(deck, options)
        
        # Launch browser
        browser = await launch(headless=True, args=[
            '--no-sandbox',
            '--disable-dev-shm-usage'
        ])
        
        try:
            page = await browser.newPage()
            
            # Set viewport for consistent rendering
            await page.setViewport({
                'width': 1920,
                'height': 1080,
                'deviceScaleFactor': 2
            })
            
            # Load HTML content
            await page.setContent(html_content, {
                'waitUntil': 'networkidle2'
            })
            
            # Generate PDF
            pdf_options = {
                'format': options.page_size,
                'landscape': options.orientation == 'landscape',
                'printBackground': True,
                'margin': {
                    'top': '0.5in',
                    'bottom': '0.5in',
                    'left': '0.5in',
                    'right': '0.5in'
                }
            }
            
            temp_path = f"/tmp/export_{uuid4().hex}.pdf"
            await page.pdf({**pdf_options, 'path': temp_path})
            
            return temp_path
            
        finally:
            await browser.close()
    
    def _generate_html(self, deck: DeckSchema, options: ExportOptions) -> str:
        """Generate HTML representation of slides"""
        
        slides_html = []
        
        for i, slide in enumerate(deck.slides):
            slide_html = f"""
            <div class="slide" id="slide-{i}">
                {self._render_slide_elements(slide, deck.assets)}
            </div>
            """
            slides_html.append(slide_html)
            
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                {self._get_pdf_css(options)}
            </style>
        </head>
        <body>
            {''.join(slides_html)}
        </body>
        </html>
        """
```

### ReportLab PDF Export (Alternative)
```python
class ReportLabPDFExporter:
    def export(self, deck: DeckSchema, options: ExportOptions) -> str:
        """Generate PDF using ReportLab"""
        
        temp_path = f"/tmp/export_{uuid4().hex}.pdf"
        
        # Create document
        doc = SimpleDocTemplate(
            temp_path,
            pagesize=self._get_page_size(options),
            topMargin=0.5*inch,
            bottomMargin=0.5*inch,
            leftMargin=0.5*inch,
            rightMargin=0.5*inch
        )
        
        story = []
        
        for slide in deck.slides:
            # Add slide content
            slide_content = self._create_slide_content(slide, deck.assets)
            story.extend(slide_content)
            
            # Add page break except for last slide
            if slide != deck.slides[-1]:
                story.append(PageBreak())
        
        doc.build(story)
        return temp_path
```

## Job Processing Pipeline

### Main Export Worker
```python
@celery_app.task(bind=True, max_retries=2)
def export_document(self, job_payload: dict):
    """Main export task"""
    
    job_id = job_payload['job_id']
    
    try:
        # Update job status
        self.update_job_status(job_id, 'running', 10, 'Loading document')
        
        # Load document from database
        deck = self.load_deck_from_db(job_payload['document_id'])
        self.update_job_status(job_id, 'running', 30, 'Document loaded')
        
        # Parse export options
        options = ExportOptions(**job_payload.get('options', {}))
        
        # Choose exporter based on format
        if job_payload['format'] == 'pptx':
            exporter = PPTXExporter(self.storage_backend)
            temp_file = exporter.export(deck, options)
        elif job_payload['format'] == 'pdf':
            exporter = PuppeteerPDFExporter(self.storage_backend)
            temp_file = await exporter.export(deck, options)
            
        self.update_job_status(job_id, 'running', 70, 'Export generated')
        
        # Upload to storage
        export_path = f"exports/{job_payload['document_id']}/{job_id}.{job_payload['format']}"
        storage_url = self.storage_backend.upload_file(temp_file, export_path)
        
        self.update_job_status(job_id, 'running', 90, 'Upload complete')
        
        # Generate signed download URL
        download_url = self.storage_backend.generate_signed_url(
            export_path, 
            expires_in=timedelta(hours=24)
        )
        
        # Save export result
        result = ExportResult(
            job_id=job_id,
            document_id=job_payload['document_id'],
            format=job_payload['format'],
            file_path=export_path,
            file_size=os.path.getsize(temp_file),
            download_url=download_url,
            expires_at=datetime.utcnow() + timedelta(hours=24),
            metadata={'options': asdict(options)}
        )
        
        self.save_export_result(result)
        self.update_job_status(job_id, 'succeeded', 100, 'Export ready for download')
        
        # Cleanup
        os.unlink(temp_file)
        
        return {
            'export_url': download_url,
            'file_size': result.file_size
        }
        
    except Exception as exc:
        logger.exception(f"Export failed for job {job_id}")
        self.update_job_status(job_id, 'failed', None, str(exc))
        
        if self.request.retries < self.max_retries:
            raise self.retry(countdown=60 * (self.request.retries + 1))
        
        raise
```

## Asset Management

### Asset Retrieval and Embedding
```python
class AssetHandler:
    def __init__(self, storage_backend: StorageBackend):
        self.storage = storage_backend
        self._cache = {}  # Simple in-memory cache
        
    def get_asset(self, asset_id: str, asset_info: AssetSchema) -> bytes:
        """Retrieve asset with caching"""
        
        if asset_id in self._cache:
            return self._cache[asset_id]
            
        # Download from storage
        asset_data = self.storage.download(asset_info.storage_path)
        
        # Cache for reuse in same export job
        self._cache[asset_id] = asset_data
        
        return asset_data
        
    def optimize_for_export(self, asset_data: bytes, target_format: str) -> bytes:
        """Optimize asset for specific export format"""
        
        if target_format == 'pdf':
            # Compress images more aggressively for PDF
            return self._compress_image(asset_data, quality=70)
        elif target_format == 'pptx':
            # Preserve higher quality for PPTX
            return self._compress_image(asset_data, quality=90)
            
        return asset_data
```

## Template and Theme Support

### Master Template Application
```python
class TemplateManager:
    def __init__(self):
        self.templates = self._load_templates()
        
    def apply_template(self, prs: Presentation, template_name: str):
        """Apply master template to presentation"""
        
        if template_name not in self.templates:
            raise ValueError(f"Template {template_name} not found")
            
        template_path = self.templates[template_name]
        template_prs = Presentation(template_path)
        
        # Copy slide masters
        for master in template_prs.slide_masters:
            prs.slide_masters._sldMasterLst.append(master._element)
            
        # Update slide layouts to use new masters
        for slide in prs.slides:
            slide.slide_layout = prs.slide_layouts[0]  # Use first layout
```

## Quality Assurance

### Export Validation
```python
class ExportValidator:
    def validate_pptx(self, file_path: str) -> ValidationResult:
        """Validate generated PPTX file"""
        
        try:
            # Try to open with python-pptx
            prs = Presentation(file_path)
            
            issues = []
            
            # Check slide count
            if len(prs.slides) == 0:
                issues.append("No slides in presentation")
                
            # Check for corrupted slides
            for i, slide in enumerate(prs.slides):
                try:
                    _ = slide.shapes  # Access shapes to trigger parsing
                except Exception as e:
                    issues.append(f"Slide {i+1} corrupted: {str(e)}")
                    
            return ValidationResult(
                is_valid=len(issues) == 0,
                issues=issues,
                file_size=os.path.getsize(file_path)
            )
            
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                issues=[f"Failed to open PPTX: {str(e)}"],
                file_size=os.path.getsize(file_path) if os.path.exists(file_path) else 0
            )
```

## Performance Optimization

### Concurrent Asset Processing
```python
@celery_app.task
def export_with_parallel_assets(job_payload: dict):
    """Export with parallel asset loading"""
    
    deck = load_deck_from_db(job_payload['document_id'])
    
    # Preload all assets in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        asset_futures = {
            asset_id: executor.submit(storage_backend.download, asset.storage_path)
            for asset_id, asset in deck.assets.items()
        }
        
        # Wait for all assets to load
        loaded_assets = {
            asset_id: future.result()
            for asset_id, future in asset_futures.items()
        }
    
    # Continue with export using preloaded assets
    # ...
```

### Memory Management
```python
class MemoryEfficientExporter:
    def __init__(self, max_memory_mb: int = 500):
        self.max_memory_mb = max_memory_mb
        
    def export_large_deck(self, deck: DeckSchema, options: ExportOptions) -> str:
        """Export large presentations in chunks"""
        
        chunk_size = 10  # Process 10 slides at a time
        slide_chunks = [
            deck.slides[i:i + chunk_size] 
            for i in range(0, len(deck.slides), chunk_size)
        ]
        
        temp_files = []
        
        for i, chunk in enumerate(slide_chunks):
            # Create partial presentation
            chunk_deck = DeckSchema(
                slides=chunk,
                assets={k: v for k, v in deck.assets.items() if self._asset_used_in_chunk(k, chunk)},
                metadata=deck.metadata,
                styles=deck.styles
            )
            
            # Export chunk
            chunk_file = self._export_chunk(chunk_deck, options, i)
            temp_files.append(chunk_file)
            
        # Merge all chunks into final file
        final_file = self._merge_presentations(temp_files, options.format)
        
        # Cleanup chunk files
        for temp_file in temp_files:
            os.unlink(temp_file)
            
        return final_file
```

## Error Handling

### Export Error Types
```python
class ExportError(Exception):
    """Base export error"""
    pass

class TemplateNotFoundError(ExportError):
    """Template file not found"""
    pass

class AssetNotFoundError(ExportError):
    """Required asset not found"""
    pass

class RenderingError(ExportError):
    """Error during rendering process"""
    pass

class PostProcessingError(ExportError):
    """Error during post-processing"""
    pass
```

## Testing Strategy

### Unit Tests
```python
class TestPPTXExporter:
    def test_export_simple_deck(self):
        deck = create_test_deck(slide_count=3)
        exporter = PPTXExporter(MockStorageBackend())
        
        file_path = exporter.export(deck, ExportOptions())
        
        # Validate result
        prs = Presentation(file_path)
        assert len(prs.slides) == 3
        
    def test_export_with_images(self):
        deck = create_deck_with_images()
        exporter = PPTXExporter(MockStorageBackend())
        
        file_path = exporter.export(deck, ExportOptions())
        
        # Check images are embedded
        prs = Presentation(file_path)
        image_count = sum(1 for slide in prs.slides 
                         for shape in slide.shapes 
                         if shape.shape_type == MSO_SHAPE_TYPE.PICTURE)
        assert image_count > 0

class TestPDFExporter:
    @pytest.mark.asyncio
    async def test_pdf_export(self):
        deck = create_test_deck()
        exporter = PuppeteerPDFExporter(MockStorageBackend())
        
        file_path = await exporter.export(deck, ExportOptions(format='pdf'))
        
        assert os.path.exists(file_path)
        assert file_path.endswith('.pdf')
```

### Integration Tests
```python
def test_end_to_end_export():
    """Test complete export pipeline"""
    
    # Create test document
    document_id = create_test_document()
    
    # Trigger export
    job_id = trigger_export(document_id, 'pptx')
    
    # Wait for completion
    result = wait_for_export_completion(job_id)
    
    # Verify export
    assert result.status == 'succeeded'
    assert result.download_url is not None
    
    # Download and validate
    downloaded_file = download_export(result.download_url)
    validation = validate_pptx_file(downloaded_file)
    assert validation.is_valid
```

### Fidelity Tests
```python
def test_export_fidelity():
    """Test export maintains acceptable fidelity"""
    
    test_cases = [
        ('text_formatting.json', 'pptx', validate_text_formatting),
        ('complex_layout.json', 'pdf', validate_layout_preservation),
        ('image_heavy.json', 'pptx', validate_image_quality)
    ]
    
    for deck_fixture, format, validator in test_cases:
        deck = load_test_deck(deck_fixture)
        exported_file = export_deck(deck, format)
        
        fidelity_score = validator(exported_file, deck)
        assert fidelity_score > 0.90  # 90% fidelity threshold
```

## Monitoring & Observability

### Export Metrics
```python
from prometheus_client import Counter, Histogram

EXPORTS_TOTAL = Counter('exports_total', ['format', 'status'])
EXPORT_DURATION = Histogram('export_duration_seconds', ['format'])
EXPORT_FILE_SIZE = Histogram('export_file_size_bytes', ['format'])
TEMPLATE_USAGE = Counter('template_usage_total', ['template_name'])
```

### Health Monitoring
```python
@celery_app.task
def export_health_check():
    """Periodic health check for export service"""
    
    try:
        # Test PPTX export
        test_deck = create_minimal_test_deck()
        pptx_file = export_deck(test_deck, 'pptx')
        validate_pptx(pptx_file)
        
        # Test PDF export (if enabled)
        pdf_file = export_deck(test_deck, 'pdf')
        validate_pdf(pdf_file)
        
        logger.info("Export service health check passed")
        return {"status": "healthy"}
        
    except Exception as e:
        logger.error(f"Export service health check failed: {str(e)}")
        raise
```

## Deployment Configuration

### Environment Variables
```bash
# Export service configuration
EXPORT_WORKER_CONCURRENCY=2
EXPORT_TASK_TIME_LIMIT=600  # 10 minutes
EXPORT_TASK_SOFT_TIME_LIMIT=540

# Puppeteer configuration
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_ARGS=--no-sandbox,--disable-dev-shm-usage

# Template storage
TEMPLATE_STORAGE_PATH=/app/templates
DEFAULT_TEMPLATE=modern_business

# Quality settings
MAX_EXPORT_FILE_SIZE_MB=100
ENABLE_EXPORT_VALIDATION=true
```

### Docker Configuration
```dockerfile
FROM python:3.11-slim

# Install Chromium for PDF export
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Set up templates directory
COPY templates/ /app/templates/

USER celery
CMD ["celery", "worker", "-A", "worker.export", "--loglevel=info"]
```

## Future Enhancements

### Advanced Features
- Custom branding and template creation
- Animation preservation in PPTX exports
- Advanced PDF options (bookmarks, hyperlinks)
- Batch export for multiple documents
- Export scheduling and recurring exports
- Export analytics and usage tracking
- Custom fonts embedding and licensing
- Export to additional formats (ODP, Google Slides)
- Collaborative review before export finalization