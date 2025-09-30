# Editor & Renderer Implementation

## Overview
The Editor & Renderer provides the core slide editing experience with real-time preview, WYSIWYG editing capabilities, and support for AI-driven content generation in the SlideCraft AI platform.

## Component Responsibilities
- Render slides from Deck JSON format with high fidelity
- Provide WYSIWYG editing interface with element manipulation
- Support keyboard shortcuts and accessibility features
- Integrate with AI for content generation and refinement
- Manage editor state (selection, focus, undo/redo)
- Handle media rendering (images, videos, charts)
- Export view-only presentation mode

## Tech Stack
- **UI Framework**: React 18 with TypeScript
- **Rendering**: Canvas API + DOM hybrid approach
- **State Management**: Zustand for editor state
- **Rich Text**: Lexical editor for text elements
- **Styling**: Tailwind CSS + CSS-in-JS for dynamic styles
- **Animation**: Framer Motion for transitions
- **Media**: Sharp for image optimization (backend)

## Architecture Overview

### Deck JSON Schema
```typescript
interface Deck {
  id: string;
  title: string;
  theme: Theme;
  slides: Slide[];
  version: string;
  metadata: {
    created_at: string;
    updated_at: string;
    created_by: string;
  };
}

interface Slide {
  id: string;
  order: number;
  layout: LayoutType;
  elements: SlideElement[];
  background?: Background;
  transition?: Transition;
  notes?: string;
}

type LayoutType = 
  | 'title'
  | 'title-content'
  | 'two-column'
  | 'blank'
  | 'section-header'
  | 'image-full'
  | 'comparison';

interface SlideElement {
  id: string;
  type: ElementType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation?: number;
  opacity?: number;
  zIndex: number;
  locked?: boolean;
  // Type-specific properties
  content: TextContent | ImageContent | ShapeContent | ChartContent | VideoContent;
  style?: ElementStyle;
}

type ElementType = 'text' | 'image' | 'shape' | 'chart' | 'video' | 'icon' | 'table';

interface TextContent {
  type: 'text';
  text: string; // Lexical JSON format
  placeholder?: string;
}

interface ImageContent {
  type: 'image';
  url: string;
  alt?: string;
  fit: 'cover' | 'contain' | 'fill';
  filters?: ImageFilters;
}

interface ShapeContent {
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'triangle' | 'arrow' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface ChartContent {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  data: ChartData;
  options?: ChartOptions;
}

interface ElementStyle {
  background?: string;
  border?: {
    width: number;
    color: string;
    radius?: number;
  };
  shadow?: {
    x: number;
    y: number;
    blur: number;
    color: string;
  };
  padding?: { top: number; right: number; bottom: number; left: number };
}

interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono?: string;
  };
  spacing: {
    base: number; // 4px by default
  };
}
```

### Editor State Management (Zustand)
```typescript
interface EditorStore {
  // Document state
  deck: Deck | null;
  activeSlideId: string | null;
  selectedElementIds: string[];
  
  // UI state
  mode: 'edit' | 'present' | 'view';
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  
  // History
  history: {
    past: Deck[];
    future: Deck[];
  };
  
  // Actions
  loadDeck: (deck: Deck) => void;
  updateSlide: (slideId: string, updates: Partial<Slide>) => void;
  addElement: (slideId: string, element: SlideElement) => void;
  updateElement: (slideId: string, elementId: string, updates: Partial<SlideElement>) => void;
  deleteElement: (slideId: string, elementId: string) => void;
  selectElement: (elementId: string, multi?: boolean) => void;
  clearSelection: () => void;
  
  // Slide operations
  addSlide: (afterSlideId?: string, layout?: LayoutType) => void;
  deleteSlide: (slideId: string) => void;
  duplicateSlide: (slideId: string) => void;
  reorderSlides: (slideIds: string[]) => void;
  
  // History
  undo: () => void;
  redo: () => void;
  pushHistory: (deck: Deck) => void;
  
  // View
  setZoom: (zoom: number) => void;
  setMode: (mode: 'edit' | 'present' | 'view') => void;
}

const useEditorStore = create<EditorStore>((set, get) => ({
  deck: null,
  activeSlideId: null,
  selectedElementIds: [],
  mode: 'edit',
  zoom: 1,
  gridEnabled: true,
  snapEnabled: true,
  history: { past: [], future: [] },
  
  loadDeck: (deck) => set({ deck, activeSlideId: deck.slides[0]?.id }),
  
  updateSlide: (slideId, updates) => {
    const { deck } = get();
    if (!deck) return;
    
    const newDeck = {
      ...deck,
      slides: deck.slides.map(slide =>
        slide.id === slideId ? { ...slide, ...updates } : slide
      )
    };
    
    get().pushHistory(deck);
    set({ deck: newDeck });
  },
  
  addElement: (slideId, element) => {
    const { deck } = get();
    if (!deck) return;
    
    const newDeck = {
      ...deck,
      slides: deck.slides.map(slide =>
        slide.id === slideId
          ? { ...slide, elements: [...slide.elements, element] }
          : slide
      )
    };
    
    get().pushHistory(deck);
    set({ deck: newDeck, selectedElementIds: [element.id] });
  },
  
  updateElement: (slideId, elementId, updates) => {
    const { deck } = get();
    if (!deck) return;
    
    const newDeck = {
      ...deck,
      slides: deck.slides.map(slide =>
        slide.id === slideId
          ? {
              ...slide,
              elements: slide.elements.map(el =>
                el.id === elementId ? { ...el, ...updates } : el
              )
            }
          : slide
      )
    };
    
    get().pushHistory(deck);
    set({ deck: newDeck });
  },
  
  deleteElement: (slideId, elementId) => {
    const { deck } = get();
    if (!deck) return;
    
    const newDeck = {
      ...deck,
      slides: deck.slides.map(slide =>
        slide.id === slideId
          ? { ...slide, elements: slide.elements.filter(el => el.id !== elementId) }
          : slide
      )
    };
    
    get().pushHistory(deck);
    set({ 
      deck: newDeck,
      selectedElementIds: get().selectedElementIds.filter(id => id !== elementId)
    });
  },
  
  selectElement: (elementId, multi = false) => {
    const { selectedElementIds } = get();
    
    if (multi) {
      const newSelection = selectedElementIds.includes(elementId)
        ? selectedElementIds.filter(id => id !== elementId)
        : [...selectedElementIds, elementId];
      set({ selectedElementIds: newSelection });
    } else {
      set({ selectedElementIds: [elementId] });
    }
  },
  
  clearSelection: () => set({ selectedElementIds: [] }),
  
  addSlide: (afterSlideId, layout = 'blank') => {
    const { deck } = get();
    if (!deck) return;
    
    const afterIndex = afterSlideId
      ? deck.slides.findIndex(s => s.id === afterSlideId)
      : deck.slides.length - 1;
    
    const newSlide: Slide = {
      id: generateId(),
      order: afterIndex + 1,
      layout,
      elements: getLayoutTemplate(layout),
      background: { type: 'solid', color: '#ffffff' }
    };
    
    const newSlides = [
      ...deck.slides.slice(0, afterIndex + 1),
      newSlide,
      ...deck.slides.slice(afterIndex + 1).map(s => ({ ...s, order: s.order + 1 }))
    ];
    
    const newDeck = { ...deck, slides: newSlides };
    get().pushHistory(deck);
    set({ deck: newDeck, activeSlideId: newSlide.id });
  },
  
  deleteSlide: (slideId) => {
    const { deck, activeSlideId } = get();
    if (!deck || deck.slides.length <= 1) return;
    
    const slideIndex = deck.slides.findIndex(s => s.id === slideId);
    const newSlides = deck.slides
      .filter(s => s.id !== slideId)
      .map((s, i) => ({ ...s, order: i }));
    
    const newActiveSlideId = activeSlideId === slideId
      ? newSlides[Math.min(slideIndex, newSlides.length - 1)].id
      : activeSlideId;
    
    const newDeck = { ...deck, slides: newSlides };
    get().pushHistory(deck);
    set({ deck: newDeck, activeSlideId: newActiveSlideId });
  },
  
  duplicateSlide: (slideId) => {
    const { deck } = get();
    if (!deck) return;
    
    const slide = deck.slides.find(s => s.id === slideId);
    if (!slide) return;
    
    const duplicatedSlide: Slide = {
      ...slide,
      id: generateId(),
      order: slide.order + 1,
      elements: slide.elements.map(el => ({ ...el, id: generateId() }))
    };
    
    get().addSlide(slideId, duplicatedSlide.layout);
  },
  
  undo: () => {
    const { history, deck } = get();
    if (history.past.length === 0 || !deck) return;
    
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);
    
    set({
      deck: previous,
      history: {
        past: newPast,
        future: [deck, ...history.future]
      }
    });
  },
  
  redo: () => {
    const { history, deck } = get();
    if (history.future.length === 0 || !deck) return;
    
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    
    set({
      deck: next,
      history: {
        past: [...history.past, deck],
        future: newFuture
      }
    });
  },
  
  pushHistory: (deck) => {
    const { history } = get();
    set({
      history: {
        past: [...history.past, deck].slice(-50), // Keep last 50 states
        future: []
      }
    });
  },
  
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(3, zoom)) }),
  setMode: (mode) => set({ mode })
}));
```

## Core Components

### SlideRenderer Component
```typescript
interface SlideRendererProps {
  slide: Slide;
  theme: Theme;
  mode: 'edit' | 'present' | 'view';
  zoom?: number;
  onElementClick?: (elementId: string, event: React.MouseEvent) => void;
  onElementDoubleClick?: (elementId: string) => void;
  selectedElementIds?: string[];
}

export const SlideRenderer: React.FC<SlideRendererProps> = ({
  slide,
  theme,
  mode,
  zoom = 1,
  onElementClick,
  onElementDoubleClick,
  selectedElementIds = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Standard 16:9 aspect ratio
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;
  
  return (
    <div
      ref={containerRef}
      className="slide-renderer"
      style={{
        width: SLIDE_WIDTH * zoom,
        height: SLIDE_HEIGHT * zoom,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        position: 'relative',
        background: slide.background?.type === 'solid'
          ? slide.background.color
          : slide.background?.type === 'gradient'
          ? slide.background.gradient
          : '#ffffff'
      }}
    >
      {/* Background layer */}
      {slide.background?.type === 'image' && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${slide.background.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: slide.background.opacity ?? 1
          }}
        />
      )}
      
      {/* Elements layer */}
      <div className="absolute inset-0">
        {slide.elements
          .sort((a, b) => a.zIndex - b.zIndex)
          .map(element => (
            <ElementRenderer
              key={element.id}
              element={element}
              theme={theme}
              mode={mode}
              isSelected={selectedElementIds.includes(element.id)}
              onClick={(e) => onElementClick?.(element.id, e)}
              onDoubleClick={() => onElementDoubleClick?.(element.id)}
            />
          ))}
      </div>
    </div>
  );
};
```

### ElementRenderer Component
```typescript
interface ElementRendererProps {
  element: SlideElement;
  theme: Theme;
  mode: 'edit' | 'present' | 'view';
  isSelected: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  theme,
  mode,
  isSelected,
  onClick,
  onDoubleClick
}) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: element.position.x,
    top: element.position.y,
    width: element.size.width,
    height: element.size.height,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    opacity: element.opacity ?? 1,
    zIndex: element.zIndex,
    cursor: mode === 'edit' && !element.locked ? 'move' : 'default',
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
    ...element.style
  };
  
  const renderContent = () => {
    switch (element.content.type) {
      case 'text':
        return <TextElement content={element.content} theme={theme} mode={mode} />;
      case 'image':
        return <ImageElement content={element.content} />;
      case 'shape':
        return <ShapeElement content={element.content} />;
      case 'chart':
        return <ChartElement content={element.content} theme={theme} />;
      case 'video':
        return <VideoElement content={element.content} mode={mode} />;
      default:
        return null;
    }
  };
  
  return (
    <motion.div
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      whileHover={mode === 'edit' && !element.locked ? { scale: 1.02 } : {}}
      transition={{ duration: 0.15 }}
    >
      {renderContent()}
    </motion.div>
  );
};
```

### TextElement Component (Lexical Integration)
```typescript
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';

interface TextElementProps {
  content: TextContent;
  theme: Theme;
  mode: 'edit' | 'present' | 'view';
}

const TextElement: React.FC<TextElementProps> = ({ content, theme, mode }) => {
  const [editorState, setEditorState] = useState(content.text);
  const isEditable = mode === 'edit';
  
  const initialConfig = {
    namespace: 'SlideTextEditor',
    theme: {
      text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline'
      }
    },
    editorState: editorState,
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    }
  };
  
  const handleChange = (newEditorState: EditorState) => {
    const json = JSON.stringify(newEditorState.toJSON());
    setEditorState(json);
    // Debounced update to store
    debouncedUpdateElement({ text: json });
  };
  
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="lexical-editor-content"
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
              outline: 'none',
              padding: '8px'
            }}
          />
        }
        placeholder={
          <div className="lexical-placeholder">{content.placeholder || 'Enter text...'}</div>
        }
      />
      {isEditable && <HistoryPlugin />}
      {isEditable && <OnChangePlugin onChange={handleChange} />}
    </LexicalComposer>
  );
};
```

### ImageElement Component
```typescript
interface ImageElementProps {
  content: ImageContent;
}

const ImageElement: React.FC<ImageElementProps> = ({ content }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  
  return (
    <div className="relative w-full h-full">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <ImageOff className="w-8 h-8 text-gray-400" />
        </div>
      )}
      
      <img
        src={content.url}
        alt={content.alt || ''}
        className={cn(
          'w-full h-full transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          objectFit: content.fit || 'cover',
          filter: content.filters ? buildFilterString(content.filters) : undefined
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
};

function buildFilterString(filters: ImageFilters): string {
  const parts: string[] = [];
  
  if (filters.brightness) parts.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast) parts.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation) parts.push(`saturate(${filters.saturation}%)`);
  if (filters.blur) parts.push(`blur(${filters.blur}px)`);
  if (filters.grayscale) parts.push(`grayscale(${filters.grayscale}%)`);
  
  return parts.join(' ');
}
```

### ChartElement Component (Recharts Integration)
```typescript
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface ChartElementProps {
  content: ChartContent;
  theme: Theme;
}

const ChartElement: React.FC<ChartElementProps> = ({ content, theme }) => {
  const renderChart = () => {
    const commonProps = {
      data: content.data.datasets,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };
    
    switch (content.chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <XAxis dataKey="name" stroke={theme.colors.text} />
            <YAxis stroke={theme.colors.text} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill={theme.colors.primary} />
          </BarChart>
        );
        
      case 'line':
        return (
          <LineChart {...commonProps}>
            <XAxis dataKey="name" stroke={theme.colors.text} />
            <YAxis stroke={theme.colors.text} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={theme.colors.primary} />
          </LineChart>
        );
        
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={content.data.datasets}
              cx="50%"
              cy="50%"
              labelLine={false}
              label
              outerRadius={80}
              fill={theme.colors.primary}
              dataKey="value"
            />
            <Tooltip />
          </PieChart>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="w-full h-full flex items-center justify-center">
      {renderChart()}
    </div>
  );
};
```

## Editor Controls

### Toolbar Component
```typescript
interface ToolbarProps {
  onAddElement: (type: ElementType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddElement,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  return (
    <div className="flex items-center gap-2 p-2 bg-white border-b">
      {/* History controls */}
      <div className="flex items-center gap-1 border-r pr-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Cmd+Z)"
        >
          <Undo className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Element tools */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddElement('text')}
          title="Add Text"
        >
          <Type className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddElement('image')}
          title="Add Image"
        >
          <Image className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddElement('shape')}
          title="Add Shape"
        >
          <Square className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddElement('chart')}
          title="Add Chart"
        >
          <BarChart3 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
```

### Properties Panel
```typescript
interface PropertiesPanelProps {
  selectedElements: SlideElement[];
  onUpdateElement: (elementId: string, updates: Partial<SlideElement>) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElements,
  onUpdateElement
}) => {
  if (selectedElements.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Select an element to edit its properties
      </div>
    );
  }
  
  const element = selectedElements[0]; // Single selection for now
  
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Position & Size */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Position & Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">X</Label>
              <Input
                type="number"
                value={element.position.x}
                onChange={(e) => onUpdateElement(element.id, {
                  position: { ...element.position, x: Number(e.target.value) }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Y</Label>
              <Input
                type="number"
                value={element.position.y}
                onChange={(e) => onUpdateElement(element.id, {
                  position: { ...element.position, y: Number(e.target.value) }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Width</Label>
              <Input
                type="number"
                value={element.size.width}
                onChange={(e) => onUpdateElement(element.id, {
                  size: { ...element.size, width: Number(e.target.value) }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Height</Label>
              <Input
                type="number"
                value={element.size.height}
                onChange={(e) => onUpdateElement(element.id, {
                  size: { ...element.size, height: Number(e.target.value) }
                })}
              />
            </div>
          </div>
        </div>
        
        {/* Rotation & Opacity */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Transform</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Rotation: {element.rotation || 0}°</Label>
              <Slider
                value={[element.rotation || 0]}
                min={0}
                max={360}
                step={1}
                onValueChange={([value]) => onUpdateElement(element.id, { rotation: value })}
              />
            </div>
            <div>
              <Label className="text-xs">Opacity: {((element.opacity || 1) * 100).toFixed(0)}%</Label>
              <Slider
                value={[(element.opacity || 1) * 100]}
                min={0}
                max={100}
                step={1}
                onValueChange={([value]) => onUpdateElement(element.id, { opacity: value / 100 })}
              />
            </div>
          </div>
        </div>
        
        {/* Type-specific properties */}
        {element.content.type === 'text' && (
          <TextProperties element={element} onUpdate={onUpdateElement} />
        )}
        {element.content.type === 'image' && (
          <ImageProperties element={element} onUpdate={onUpdateElement} />
        )}
      </div>
    </ScrollArea>
  );
};
```

## Keyboard Shortcuts

### Keyboard Handler Hook
```typescript
export const useEditorKeyboard = () => {
  const { undo, redo, deleteElement, duplicateElement } = useEditorStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      // Undo: Cmd/Ctrl + Z
      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      
      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if ((modKey && e.shiftKey && e.key === 'z') || (modKey && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
      
      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const { selectedElementIds, activeSlideId } = useEditorStore.getState();
        selectedElementIds.forEach(id => {
          if (activeSlideId) deleteElement(activeSlideId, id);
        });
      }
      
      // Duplicate: Cmd/Ctrl + D
      if (modKey && e.key === 'd') {
        e.preventDefault();
        const { selectedElementIds, activeSlideId } = useEditorStore.getState();
        if (activeSlideId && selectedElementIds.length === 1) {
          duplicateElement(activeSlideId, selectedElementIds[0]);
        }
      }
      
      // Select All: Cmd/Ctrl + A
      if (modKey && e.key === 'a') {
        e.preventDefault();
        const { deck, activeSlideId } = useEditorStore.getState();
        const slide = deck?.slides.find(s => s.id === activeSlideId);
        if (slide) {
          useEditorStore.setState({
            selectedElementIds: slide.elements.map(el => el.id)
          });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteElement, duplicateElement]);
};
```

## AI Integration

### AI-Powered Element Generation
```typescript
interface AIGenerateElementRequest {
  prompt: string;
  elementType: ElementType;
  context?: {
    slideId: string;
    existingElements: SlideElement[];
    theme: Theme;
  };
}

export const useAIElementGeneration = () => {
  const { addElement } = useEditorStore();
  
  const generateElement = useMutation({
    mutationFn: async (request: AIGenerateElementRequest) => {
      const response = await api.post<{ element: SlideElement }>('/ai/generate-element', request);
      return response.data.element;
    },
    onSuccess: (element, variables) => {
      if (variables.context?.slideId) {
        addElement(variables.context.slideId, element);
      }
    }
  });
  
  return {
    generateElement: generateElement.mutate,
    isGenerating: generateElement.isPending
  };
};
```

## Performance Optimizations

### Virtual Slide List (for thumbnail view)
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export const SlideThumbnailList: React.FC<{ slides: Slide[] }> = ({ slides }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: slides.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    gap: 8
  });
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <SlideThumbnail slide={slides[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Debounced Element Updates
```typescript
import { useDebouncedCallback } from 'use-debounce';

export const useDebouncedElementUpdate = () => {
  const { updateElement } = useEditorStore();
  
  const debouncedUpdate = useDebouncedCallback(
    (slideId: string, elementId: string, updates: Partial<SlideElement>) => {
      updateElement(slideId, elementId, updates);
    },
    300
  );
  
  return debouncedUpdate;
};
```

## Testing Strategy

### Component Tests
```typescript
describe('SlideRenderer', () => {
  it('renders slide with elements', () => {
    const slide: Slide = {
      id: 'slide-1',
      order: 0,
      layout: 'blank',
      elements: [
        {
          id: 'el-1',
          type: 'text',
          position: { x: 100, y: 100 },
          size: { width: 200, height: 50 },
          zIndex: 1,
          content: { type: 'text', text: 'Hello World' }
        }
      ]
    };
    
    render(<SlideRenderer slide={slide} theme={defaultTheme} mode="view" />);
    
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
  
  it('handles element selection', () => {
    const onElementClick = vi.fn();
    const slide = createTestSlide();
    
    render(
      <SlideRenderer
        slide={slide}
        theme={defaultTheme}
        mode="edit"
        onElementClick={onElementClick}
      />
    );
    
    fireEvent.click(screen.getByTestId('element-1'));
    
    expect(onElementClick).toHaveBeenCalledWith('element-1', expect.any(Object));
  });
});
```

### Store Tests
```typescript
describe('EditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState(getInitialState());
  });
  
  it('adds element to slide', () => {
    const deck = createTestDeck();
    const { loadDeck, addElement } = useEditorStore.getState();
    
    loadDeck(deck);
    
    const newElement: SlideElement = {
      id: 'new-el',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50 },
      zIndex: 1,
      content: { type: 'text', text: 'New element' }
    };
    
    addElement(deck.slides[0].id, newElement);
    
    const state = useEditorStore.getState();
    expect(state.deck?.slides[0].elements).toHaveLength(2);
    expect(state.selectedElementIds).toEqual(['new-el']);
  });
  
  it('supports undo/redo', () => {
    const deck = createTestDeck();
    const { loadDeck, updateElement, undo, redo } = useEditorStore.getState();
    
    loadDeck(deck);
    
    const slideId = deck.slides[0].id;
    const elementId = deck.slides[0].elements[0].id;
    
    updateElement(slideId, elementId, { position: { x: 100, y: 100 } });
    
    let state = useEditorStore.getState();
    expect(state.deck?.slides[0].elements[0].position.x).toBe(100);
    
    undo();
    
    state = useEditorStore.getState();
    expect(state.deck?.slides[0].elements[0].position.x).toBe(0);
    
    redo();
    
    state = useEditorStore.getState();
    expect(state.deck?.slides[0].elements[0].position.x).toBe(100);
  });
});
```

## Accessibility

### ARIA Labels and Keyboard Navigation
```typescript
export const AccessibleSlideRenderer: React.FC<SlideRendererProps> = (props) => {
  return (
    <div
      role="region"
      aria-label={`Slide ${props.slide.order + 1}`}
      tabIndex={0}
    >
      <SlideRenderer {...props} />
    </div>
  );
};

export const AccessibleElementRenderer: React.FC<ElementRendererProps> = (props) => {
  return (
    <div
      role="button"
      aria-label={`${props.element.type} element`}
      aria-selected={props.isSelected}
      tabIndex={props.mode === 'edit' ? 0 : -1}
    >
      <ElementRenderer {...props} />
    </div>
  );
};
```

## Future Enhancements

- **Advanced Animations**: Element enter/exit animations, transition effects
- **Collaboration Cursors**: Real-time cursor tracking overlay
- **Smart Guides**: Alignment guides and snap-to-grid
- **Layer Management**: Z-index panel with drag-to-reorder
- **Master Slides**: Template system for consistent layouts
- **Animation Timeline**: Keyframe-based animation editor
- **3D Transforms**: Perspective and 3D rotation support
- **Vector Drawing**: SVG path editor for custom shapes
- **Component Library**: Reusable element templates
