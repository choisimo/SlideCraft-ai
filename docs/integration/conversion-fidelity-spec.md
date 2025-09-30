# Conversion Fidelity Specification

## Purpose
Define quality standards, acceptable loss boundaries, and validation criteria for transforming source presentation formats (PPTX, PDF, DOCX) into SlideCraft's normalized internal deck JSON schema, ensuring users can edit converted content with confidence.

## Scope
Covers input format support, element mapping rules, precision targets for layout/styling, unsupported feature handling, and regression test framework for conversion accuracy.

## Supported Source Formats (Initial Release)
| Format | Extensions | Priority | Notes |
|--------|-----------|----------|-------|
| PowerPoint | .pptx (Office Open XML) | P0 | Primary target format |
| PDF | .pdf | P1 | Layout extraction, no edit metadata |
| Word | .docx | P2 | Text-heavy slides from outlines |

Future consideration: .key (Keynote), .odp (OpenDocument), Google Slides export.

## Normalized Deck Schema (Target Model)
```json
{
  "version": "1.0",
  "metadata": { "title", "author?", "createdAt", "slideCount" },
  "slides": [
    {
      "id": "uuid",
      "layout": "title | content | two-column | blank",
      "elements": [
        {
          "type": "text | image | shape | table | chart",
          "bounds": { "x", "y", "width", "height" },
          "style": { "font?", "fontSize?", "color?", "fill?", "border?" },
          "content": { ... type-specific }
        }
      ],
      "background": { "color?" | "image?" },
      "notes": "string?"
    }
  ],
  "theme": { "colors": [], "fonts": [] }
}
```

## Element Mapping Rules
### Text Boxes
- **Input:** PPTX `<p:sp>` with `<a:t>`, PDF text blocks, DOCX paragraphs
- **Output:** `{ type: "text", content: { runs: [{ text, style }] }, bounds }`
- **Fidelity Targets:**
  - Font family: Map to web-safe equivalent or embed if custom (>90% visual match)
  - Font size: Exact (±0.5pt acceptable for PDF OCR-derived)
  - Color: Exact RGB (hex)
  - Bold/Italic/Underline: Preserve 100%
  - Alignment (left/center/right/justify): Preserve 100%
  - Line spacing: ±10% acceptable
  - Bullet/numbering: Preserve list level (max 5 levels)
- **Known Limitations:**
  - Complex text effects (3D, shadow >2 layers): Simplified to flat shadow
  - Vertical text: Convert to horizontal with rotation metadata (editor may not support rotation initially)

### Images
- **Input:** PPTX embedded images, PDF raster/vector, DOCX inline images
- **Output:** `{ type: "image", content: { url, alt?, originalFormat }, bounds }`
- **Fidelity Targets:**
  - Format: Extract as PNG or JPEG; preserve vector (SVG) if source is EMF/WMF in PPTX
  - Resolution: Maintain aspect ratio 100%, resize to max 2048px longest edge
  - Positioning: ±2px from original bounds
  - Cropping: Preserve crop rect if embedded in PPTX
  - Transparency: Preserve alpha channel
- **Known Limitations:**
  - Linked images (external URLs in PPTX): Download and embed (or fail with error if unreachable)
  - Image effects (artistic filters): Not preserved

### Shapes (Rectangles, Ellipses, Lines, Arrows)
- **Input:** PPTX `<p:sp>` with preset geometries, PDF vector paths
- **Output:** `{ type: "shape", content: { shapeType, fill, stroke }, bounds }`
- **Fidelity Targets:**
  - Basic shapes (rect, ellipse, line, arrow): 100% geometry
  - Fill (solid, gradient): Solid preserved exactly; linear gradient 2-stop supported; radial/complex → fallback to dominant color
  - Stroke: Width exact, dash pattern (solid/dashed/dotted) preserved
  - Custom/freeform paths: Rasterize to image if >20 points
- **Known Limitations:**
  - 3D shapes: Flattened to 2D projection
  - Connectors with auto-routing: Static snapshot

### Tables
- **Input:** PPTX tables, DOCX tables, PDF table detection (heuristic)
- **Output:** `{ type: "table", content: { rows, cols, cells: [[{ text, style, colspan?, rowspan? }]] }, bounds }`
- **Fidelity Targets:**
  - Cell structure: Preserve row/col count, merges (colspan/rowspan) 100%
  - Cell borders: Preserve color & width per edge
  - Cell background: Solid fill preserved
  - Text within cells: Apply text mapping rules
- **Known Limitations:**
  - Nested tables: Flatten to single-level or warn
  - Table styles (banded rows): Explicit cell-level styles only

### Charts
- **Input:** PPTX embedded Excel charts, PDF rasterized charts
- **Output:** 
  - **Option A (MVP):** Rasterize to image `{ type: "image" }` with metadata `{ chartType, dataHint }`
  - **Option B (future):** Extract data series `{ type: "chart", content: { chartType, series, axes } }`
- **Fidelity Targets (Option A):**
  - Visual: High-res PNG snapshot (300 DPI equivalent)
  - Editability: Not editable (requires re-creation)
- **Future (Option B):** Preserve bar/line/pie data points, axis labels, legend

### Slide Backgrounds
- **Input:** Solid color, gradient, image fill
- **Output:** `{ background: { type: "color" | "image", value } }`
- **Fidelity:** Solid & image 100%; gradient fallback to dominant color initially

### Slide Notes
- **Input:** PPTX notes pane, DOCX comments (optional)
- **Output:** Plain text string `notes`
- **Fidelity:** Preserve text content; formatting stripped

### Animations & Transitions
- **Input:** PPTX animation sequences, transition effects
- **Output:** **Not preserved** (logged as metadata for future)
- **Rationale:** Editor does not support animations in v1

## Precision & Tolerance Matrix
| Attribute | Target Precision | Acceptable Tolerance | Validation Method |
|-----------|------------------|---------------------|-------------------|
| Position (x, y) | Exact (px) | ±2px | Visual diff + bounds check |
| Size (width, height) | Exact | ±2px or ±2% | Bounds check |
| Font size | Exact | ±0.5pt | Style comparison |
| Color (RGB) | Exact | ΔE <3 (perceptual) | Color distance formula |
| Line spacing | Exact | ±10% | Rendered line height |
| Aspect ratio (images) | Exact | <1% distortion | Width/height ratio |
| Slide count | Exact | 0 (must match) | Count assertion |

## Unsupported Features Handling
| Feature | Action | User Notification |
|---------|--------|-------------------|
| Embedded video/audio | Extract metadata, placeholder image | Warning: "Media not supported, replaced with placeholder" |
| Macros/VBA | Ignored | Info: "Macros removed" |
| 3D models | Rasterize to 2D snapshot | Warning: "3D object flattened" |
| Smart Art | Convert to grouped shapes (best effort) | Warning: "SmartArt converted to shapes" |
| Embedded fonts (licensed) | Fallback to similar system font | Info: "Custom font substituted" |
| Hyperlinks in text | Preserve URL in metadata (not clickable in v1) | Info: "Links preserved as metadata" |

## Conversion Pipeline Stages
1. **Validation:** Check file integrity, format support, size limits (<100MB initial)
2. **Extraction:** Unzip PPTX/DOCX, parse XML; PDF: use pdf.js or pdfplumber
3. **Element Enumeration:** Iterate slides → shapes → properties
4. **Mapping:** Apply rules above per element type
5. **Asset Extraction:** Save images/media to storage, generate signed URLs
6. **Normalization:** Build JSON schema, validate against schema
7. **Preview Generation:** Render thumbnails (256x144) per slide for gallery
8. **Persistence:** Write deck JSON to DB, associate with document ID
9. **Event Emission:** Job success event with documentId

## Quality Assurance & Testing
### Regression Test Suite
- **Golden Corpus:** 50 representative PPTX files covering:
  - Simple text slides (10)
  - Image-heavy (10)
  - Complex tables (10)
  - Mixed shapes & charts (10)
  - Edge cases: huge file (50MB), many slides (100+), unsupported features (10)
- **Validation Approach:**
  - Snapshot testing: Store expected JSON output, assert deep equality (ignoring timestamps/IDs)
  - Visual regression: Render converted deck to images, compare via image diff (SSIM >0.95)
  - Manual review: Quarterly human QA of 10 random conversions
- **Pass Criteria:**
  - 95% of corpus passes schema validation
  - 90% pass visual regression threshold
  - Zero crashes or data loss

### Metrics & Monitoring
- Conversion success rate (exclude user errors like corrupted files)
- Element type distribution histogram (track unsupported feature frequency)
- Conversion duration per source format & file size
- User-reported fidelity issues (feedback channel)

## Error Taxonomy (Conversion-Specific)
| Error Code | Trigger | User Message | Retryable |
|------------|---------|--------------|-----------|
| UNSUPPORTED_FORMAT | Non .pptx/pdf/docx | "Format not supported" | No |
| FILE_CORRUPTED | Parse failure | "File damaged or unreadable" | No |
| FILE_TOO_LARGE | >100MB | "File exceeds 100MB limit" | No |
| EXTRACTION_FAILED | Temp I/O error | "Temporary conversion error" | Yes |
| SCHEMA_VALIDATION_FAILED | Internal bug | "Internal conversion error" | No (escalate) |

## Iteration & Improvement Loop
- Collect conversion failure logs + input file hashes in DLQ
- Monthly review: identify top 3 unsupported patterns, prioritize for next sprint
- User feedback form: "Was this conversion accurate?" (thumbs up/down per slide)

## Acceptance Criteria (MVP Launch)
- 90% of PPTX test corpus converts with <5% visual fidelity loss
- PDF text extraction works for standard (non-scanned) PDFs
- DOCX outline-to-slides basic support (1 heading = 1 slide)
- All unsupported features logged, user notified via warnings
- Regression suite runs in CI, blocks release on failure

## Future Enhancements
- OCR for scanned PDFs
- Chart data extraction (editable charts)
- Animation timeline preservation
- Custom font embedding (licensed permitting)
- Incremental conversion (update changed slides only on re-upload)

## Open Questions
- Licensing for embedded fonts: auto-purchase via API or require user upload?
- PDF table detection accuracy threshold acceptable before manual intervention?
- Should we support .ppt (legacy binary format) via LibreOffice headless conversion?
