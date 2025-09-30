# Export Fidelity Specification

## Purpose
Define quality standards, layout preservation rules, and validation criteria for rendering SlideCraft's normalized deck JSON into exportable presentation formats (PPTX, PDF), ensuring users can share and present exported decks with confidence across platforms.

## Scope
Covers output format support, round-trip fidelity expectations, element rendering rules, font/image handling, layout invariants, and quality assurance framework for export accuracy.

## Supported Export Formats (Initial Release)
| Format | Extensions | Priority | Use Case | Notes |
|--------|-----------|----------|----------|-------|
| PowerPoint | .pptx (Office Open XML) | P0 | Full edit capability in PowerPoint/Keynote | Primary export target |
| PDF | .pdf | P1 | Read-only distribution, printing | Flattened, no edit metadata |

Future consideration: .key (Keynote native), .odp (OpenDocument), Google Slides import format.

## Round-Trip Fidelity Expectations
| Pipeline | Expected Outcome | Acceptable Loss |
|----------|------------------|-----------------|
| PPTX → convert → edit → export PPTX | 95% layout/style match | Animations, unsupported fonts, complex gradients |
| PDF → convert → edit → export PDF | 90% visual match | Interactive elements, embedded media, text searchability if scanned |
| Native SlideCraft → export PPTX → import to PowerPoint | 98% match | Editor-only features (comments, real-time presence) |
| Native SlideCraft → export PDF → print | 100% WYSIWYG | N/A (final render) |

## Normalized Deck Schema (Source Model)
Reference: `/docs/integration/conversion-fidelity-spec.md` schema.

Export processes the same JSON schema produced by conversion, applying reverse mapping.

## Element Rendering Rules

### Text Boxes
- **Input:** `{ type: "text", content: { runs: [{ text, style }] }, bounds }`
- **PPTX Output:** `<p:sp>` with `<a:t>` text runs, `<a:rPr>` for run-level styles
- **PDF Output:** PDF text operators (TJ/Tj) with embedded fonts, positioned via transformation matrix
- **Fidelity Targets:**
  - Font family: Map web-safe fonts to system equivalents (Arial→Arial, fallback to Helvetica on macOS); embed custom fonts if license permits
  - Font size: Exact pt value
  - Color: Exact RGB hex → PPTX `<a:srgbClr>` or PDF DeviceRGB
  - Bold/Italic/Underline: Preserve via `<a:rPr b="1" i="1" u="sng">` (PPTX) or font selection (PDF)
  - Alignment: Map to PPTX `<a:pPr algn="l|ctr|r|just">` or PDF text alignment
  - Line spacing: Convert percentage/pt to PPTX `<a:spcBef>/<a:spcAft>` or PDF leading
  - Bullet/numbering: Preserve list styles `<a:buFont>`, `<a:buChar>`, level indentation
- **Known Limitations:**
  - PDF: Multi-run styled text within single paragraph may merge if PDF renderer doesn't support inline style changes
  - Custom web fonts not in system: PPTX embeds subset; PDF embeds full or subset based on license
  - Vertical text: PPTX supports `vert="vert270"`, PDF uses rotation matrix

### Images
- **Input:** `{ type: "image", content: { url, alt?, originalFormat }, bounds }`
- **PPTX Output:** `<p:pic>` with embedded `<a:blip>` (Base64 or external relation), cropping via `<a:srcRect>`
- **PDF Output:** Inline image object (JPEG/PNG) via `Do` operator, positioned/scaled via CTM
- **Fidelity Targets:**
  - Format: Re-encode to PNG or JPEG (optimize for size <5MB per image); preserve transparency
  - Resolution: Maintain original resolution if <300 DPI; downsample if >300 DPI to reduce file size
  - Positioning: Exact bounds (x, y, width, height) mapped to EMU (PPTX) or PDF units (1/72 inch)
  - Aspect ratio: Preserve 100% (no distortion)
  - Cropping: Apply crop rect if present in source JSON
  - Transparency: PPTX `<a:blip>` alpha channel; PDF transparency group or mask
- **Known Limitations:**
  - Animated GIFs: Export first frame only
  - SVG: Rasterize to PNG at 2x resolution for clarity
  - External URL images: Must be fetched and embedded before export (or fail if unreachable)

### Shapes (Rectangles, Ellipses, Lines, Arrows)
- **Input:** `{ type: "shape", content: { shapeType, fill, stroke }, bounds }`
- **PPTX Output:** `<p:sp>` with `<a:prstGeom prst="rect|ellipse|line">`, fill `<a:solidFill>/<a:gradFill>`, line `<a:ln>`
- **PDF Output:** Path construction operators (m/l/c/re) with fill/stroke operators (f/S/B)
- **Fidelity Targets:**
  - Geometry: Basic shapes exact; custom paths preserved if <100 points, else simplified
  - Fill: Solid exact; linear gradient 2-stop preserved (PPTX `<a:lin ang="...">`, PDF Type 2 shading); radial gradient best-effort or fallback to solid dominant color
  - Stroke: Width exact (pt→EMU or PDF linewidth), color exact, dash pattern `<a:prstDash val="dash|dot">` or PDF dash array
  - Transparency: PPTX `<a:alpha>`, PDF transparency group
- **Known Limitations:**
  - Complex gradients (>2 stops, non-linear): Approximate or rasterize
  - 3D effects: Not supported, export as flat 2D
  - Connectors: Static snapshot without smart routing

### Tables
- **Input:** `{ type: "table", content: { rows, cols, cells: [[{ text, style, colspan?, rowspan? }]] }, bounds }`
- **PPTX Output:** `<a:tbl>` with `<a:tr>` rows, `<a:tc>` cells, `<a:gridCol>` for column widths, merge via `<a:gridSpan>/<a:rowSpan>`
- **PDF Output:** Manual drawing via path operators for borders + text positioning per cell
- **Fidelity Targets:**
  - Structure: Preserve row/col count, cell merges (colspan/rowspan) 100%
  - Borders: Per-edge color & width `<a:ln>` (PPTX top/bottom/left/right), PDF explicit drawing
  - Cell fill: Solid background `<a:solidFill>`
  - Cell text: Apply text rendering rules per cell
  - Column/row sizing: Preserve relative widths/heights within table bounds
- **Known Limitations:**
  - Nested tables: Not supported (warn during conversion, should not appear in export)
  - Auto-fit text: Static sizing only, no dynamic reflow in PPTX/PDF

### Charts
- **Input (MVP):** `{ type: "image", metadata: { chartType, dataHint } }` (rasterized chart)
- **PPTX Output:** Embedded PNG via `<p:pic>`
- **PDF Output:** Inline PNG image
- **Fidelity:** Visual snapshot preserved; not editable in PowerPoint
- **Future:** Extract to `<c:chart>` with embedded Excel data (PPTX), PDF remains rasterized

### Slide Backgrounds
- **Input:** `{ background: { type: "color"|"image", value } }`
- **PPTX Output:** `<p:bg>` with `<a:solidFill>` or `<a:blipFill>`
- **PDF Output:** Full-page image or filled rectangle behind all content
- **Fidelity:** Solid color exact; image aspect-fill or stretch per spec; gradient fallback to solid initially

### Slide Notes
- **Input:** `{ notes: "string" }`
- **PPTX Output:** `<p:notes>` slide with plain text
- **PDF Output:** Not included (PDF has no notes concept; future: append notes page)
- **Fidelity:** Plain text preserved in PPTX; formatting not supported

### Slide Transitions & Animations
- **Input:** Not present in normalized schema v1
- **Output:** None (no transitions/animations in export)
- **Future:** When editor supports, map to PPTX `<p:transition>` and `<p:animLst>`

## Layout Invariants (Cross-Format)
| Invariant | Rule | Validation |
|-----------|------|------------|
| Slide dimensions | 16:9 default (10"x5.625"), preserve aspect if custom | Assert exported PPTX slide size matches input |
| Z-order | Elements exported in JSON array order (first = back, last = front) | Manual visual check |
| Coordinate system | PPTX uses EMU (914400 EMU = 1 inch); PDF uses points (72 pt = 1 inch) | Conversion accuracy ±1 unit |
| Font fallback consistency | Same fallback logic as conversion (see conversion-fidelity-spec.md) | Font audit log |

## Precision & Tolerance Matrix
| Attribute | Target Precision | Acceptable Tolerance | Validation Method |
|-----------|------------------|---------------------|-------------------|
| Position (x, y) | Exact | ±1px in final render (±1 EMU PPTX, ±0.5pt PDF) | Visual diff or bounds assertion |
| Size (width, height) | Exact | ±1px or ±1% | Bounds check |
| Font size | Exact | ±0.1pt | Style extraction from exported file |
| Color (RGB) | Exact | ΔE <2 (perceptual) | Color picker validation |
| Line spacing | Exact | ±5% | Rendered comparison |
| Aspect ratio (images) | Exact | <0.5% distortion | Width/height ratio check |
| Slide count | Exact | 0 (must match source) | Count assertion |
| File size (PPTX) | Optimized | <2x uncompressed assets | Archive inspection |

## Font Handling Strategy
### System Fonts
- Map common web fonts to Office equivalents:
  - `Arial → Arial`
  - `Helvetica → Helvetica (macOS), Arial (Windows)`
  - `Times New Roman → Times New Roman`
  - `Courier New → Courier New`
  - `Verdana → Verdana`

### Custom Fonts
- **Embedding Policy:**
  - If font license permits embedding (check font file license metadata or user confirmation): Embed font subset in PPTX `<a:font>` + PDF font descriptor
  - If license prohibits: Fallback to closest system font + log warning in export metadata
- **Fallback Mapping:** User configurable via theme; default: sans-serif→Arial, serif→Times, mono→Courier

### Font Subsetting
- PPTX: Embed only used glyphs via font subsetting library (reduce file size)
- PDF: Subset Type 1/TrueType fonts to used character set

## Image Handling Strategy
### Optimization
- **JPEG:** Quality 85%, progressive encoding
- **PNG:** Compression level 9, strip metadata (EXIF), quantize to 8-bit if no transparency
- **Max resolution:** 2048px longest edge (downsample larger images)
- **Transparency:** Preserve alpha channel; if format doesn't support (JPEG), use PNG

### Storage
- PPTX: Embed in `/ppt/media/` directory within archive
- PDF: Inline as stream objects with DCTDecode (JPEG) or FlateDecode (PNG)

### External URLs
- All images must be fetched and embedded during export job (no external references in final artifact)
- If fetch fails: replace with placeholder error image + log error

## Quality Assurance & Testing
### Export Regression Suite
- **Golden Corpus:** 30 SlideCraft native decks covering:
  - Text-only slides (5)
  - Image galleries (5)
  - Mixed tables + shapes (5)
  - Complex layouts (multi-column, overlapping elements) (5)
  - Edge cases: 100 slides, large images, many fonts (5)
  - Round-trip conversions (PPTX→convert→export) (5)

### Validation Approach
- **Automated:**
  - Schema validation: Extract exported PPTX/PDF metadata, assert slide count, element types
  - Visual regression: Render exported PPTX/PDF to images (via headless PowerPoint/Chromium), compare to baseline via SSIM >0.95
  - File integrity: Open in Microsoft PowerPoint, Apple Keynote, Adobe Acrobat; check for errors/warnings
- **Manual:** Quarterly review of 10 random exports by QA team for subjective quality

### Pass Criteria
- 95% of test corpus passes schema validation
- 90% pass visual regression threshold (SSIM >0.95)
- Zero file corruption (all open successfully in target apps)
- Round-trip PPTX fidelity >90% (visual comparison)

## Metrics & Monitoring
- Export success rate per format (exclude user errors)
- Export duration per format & slide count
- File size distribution (detect bloat)
- Font embedding failures (track unlicensed fonts)
- Image fetch failures (external URLs)
- User-reported quality issues (feedback channel)

## Error Taxonomy (Export-Specific)
| Error Code | Trigger | User Message | Retryable |
|------------|---------|--------------|-----------|
| EXPORT_INVALID_DECK | Malformed JSON schema | "Deck data invalid" | No |
| EXPORT_UNSUPPORTED_ELEMENT | Unknown element type | "Unsupported content in deck" | No |
| IMAGE_FETCH_FAILED | External image unreachable | "Failed to load image from [url]" | Yes (3 retries) |
| FONT_EMBED_FAILED | Font file missing/unlicensed | "Custom font not available, using fallback" | No (warn) |
| FILE_TOO_LARGE | Generated artifact >500MB | "Export exceeds size limit" | No |
| RENDERING_FAILED | Internal library error | "Export generation failed" | Yes |
| STORAGE_UPLOAD_FAILED | Artifact upload to R2 failed | "Upload failed, retry" | Yes |

## Export Pipeline Stages (Reference: job-lifecycle-spec.md)
1. **Preparing (0-10%):** Validate deck JSON schema, resolve theme, load fonts
2. **Rendering Slides (10-70%):** Iterate slides, render elements to PPTX/PDF structures
3. **Packaging (70-90%):** Assemble PPTX archive (XML + media) or finalize PDF stream
4. **Uploading Artifact (90-98%):** Upload to R2, generate signed URL
5. **Finalizing (98-100%):** Update job status, emit success event

## Output Artifact Specifications
### PPTX Structure
```
/
  [Content_Types].xml
  _rels/.rels
  ppt/
    presentation.xml
    slides/
      slide1.xml, slide2.xml, ...
      _rels/slide1.xml.rels (media relations)
    slideLayouts/ (default layouts)
    slideMasters/ (default master)
    media/
      image1.png, image2.jpg, ...
    theme/theme1.xml
```

### PDF Structure
- Single-stream PDF 1.7 compatible
- Embedded fonts as Type1/TrueType subsets
- Images as inline JPEG/PNG objects
- Page size: 10"x5.625" (16:9), or custom if specified
- No security restrictions (no password, allow printing/copying)

## SLA Targets (from job-lifecycle-spec.md)
| Deck Size | P50 Export Time | P95 | P99 | Notes |
|-----------|-----------------|-----|-----|-------|
| <10 slides | 2s | 5s | 10s | PPTX baseline |
| 10-50 slides | 4s | 12s | 25s | Medium decks |
| 50-100 slides | 8s | 20s | 40s | Large decks |

File size: <50MB for typical 20-slide deck with images.

## Security & Privacy
- No external API calls during export (all assets pre-fetched)
- Strip metadata (author, company, revision history) if user privacy mode enabled
- Signed URLs for download expire after TTL (default 1 hour, configurable)

## Consistency & Atomicity
- Export job `succeeded` status implies artifact fully uploaded and signed URL valid
- No partial artifacts persisted; failure during rendering deletes temporary files
- Idempotent: same deck + format → deterministic output (modulo timestamps)

## Future Enhancements
- Export to .key (Keynote) format
- PDF/A compliance for archival
- Watermarking option (overlay text/logo)
- Export subsets (selected slides only)
- Video/animation export to video format (MP4)
- Incremental export (only changed slides since last export)
- Batch export (multiple decks as ZIP)

## Acceptance Criteria (MVP Launch)
- 95% of native decks export to PPTX with <5% visual loss
- PDF export matches rendered preview exactly (WYSIWYG)
- Round-trip PPTX preserves 90% layout/style
- All exports open successfully in Microsoft PowerPoint, Apple Keynote, Adobe Acrobat
- Regression suite runs in CI, blocks release on failure
- Font/image fallback warnings surfaced to user via export job metadata

## Open Questions
- Font licensing: auto-purchase API integration or require user to upload licensed fonts?
- PDF accessibility (tagged PDF for screen readers): MVP scope or future?
- Should we support Office 2007-2010 compatibility mode (strict OOXML) or Office 2013+ only?
- Export template customization: allow users to define master slides/themes for export?

## Cross-References
- **Conversion Fidelity Spec:** `/docs/integration/conversion-fidelity-spec.md` (source schema, font mapping)
- **Job Lifecycle Spec:** `/docs/integration/job-lifecycle-spec.md` (export job stages, retry policy)
- **Error Taxonomy:** `/docs/integration/error-taxonomy-and-recovery.md` (error codes, user messages)
- **Monitoring:** `/docs/integration/monitoring-observability.md` (metrics, dashboards)
