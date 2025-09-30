# Real-time Collaboration Implementation

## Overview
The Real-time Collaboration system enables multiple users to edit slides simultaneously with conflict-free synchronization using CRDTs, live presence awareness, and cursor tracking in the SlideCraft AI platform.

## Component Responsibilities
- Synchronize document changes across multiple users in real-time
- Display user presence (cursors, selections, active users)
- Handle conflict-free collaborative editing with CRDTs
- Manage WebSocket/SSE connections for real-time updates
- Provide offline support with automatic sync on reconnection
- Track and display user awareness states

## Tech Stack
- **CRDT Library**: Yjs for conflict-free data synchronization
- **WebSocket**: Socket.io-client for real-time communication
- **Presence**: Custom awareness protocol with Yjs Awareness
- **Persistence**: IndexedDB for offline storage (via y-indexeddb)
- **React Integration**: Custom hooks for Yjs bindings
- **Cursors**: Custom SVG cursors with smooth animations

## Architecture Overview

### Yjs Document Structure
```typescript
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';

interface CollaborationDocument {
  deck: Y.Map<any>;        // Main deck structure
  slides: Y.Array<Y.Map>;  // Array of slide maps
  metadata: Y.Map<any>;    // Document metadata
}

class CollaborationManager {
  private ydoc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private awareness: Awareness;
  
  constructor(documentId: string, userId: string, userInfo: UserInfo) {
    this.ydoc = new Y.Doc();
    
    // Set up offline persistence
    this.indexeddbProvider = new IndexeddbPersistence(documentId, this.ydoc);
    
    // Set up WebSocket provider for real-time sync
    this.setupWebSocketProvider(documentId);
    
    // Set up awareness (presence)
    this.awareness = this.provider?.awareness || new Awareness(this.ydoc);
    this.awareness.setLocalState({
      user: {
        id: userId,
        name: userInfo.name,
        avatar: userInfo.avatar,
        color: userInfo.color
      },
      cursor: null,
      selection: null
    });
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  private setupWebSocketProvider(documentId: string) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    
    this.provider = new WebsocketProvider(
      wsUrl,
      documentId,
      this.ydoc,
      {
        connect: true,
        awareness: this.awareness,
        params: {
          token: localStorage.getItem('authToken') || ''
        }
      }
    );
    
    this.provider.on('status', (event: { status: string }) => {
      console.log('WebSocket status:', event.status);
      if (event.status === 'connected') {
        this.onConnected();
      } else if (event.status === 'disconnected') {
        this.onDisconnected();
      }
    });
    
    this.provider.on('sync', (isSynced: boolean) => {
      console.log('Sync status:', isSynced);
      if (isSynced) {
        this.onSynced();
      }
    });
  }
  
  private setupEventListeners() {
    // Listen for deck changes
    const deckMap = this.ydoc.getMap('deck');
    deckMap.observe(event => {
      this.handleDeckChange(event);
    });
    
    // Listen for slides changes
    const slidesArray = this.ydoc.getArray('slides');
    slidesArray.observe(event => {
      this.handleSlidesChange(event);
    });
    
    // Listen for awareness changes (presence)
    this.awareness.on('change', (changes: AwarenessChange) => {
      this.handleAwarenessChange(changes);
    });
  }
  
  getDeckMap(): Y.Map<any> {
    return this.ydoc.getMap('deck');
  }
  
  getSlidesArray(): Y.Array<Y.Map> {
    return this.ydoc.getArray('slides');
  }
  
  updateCursor(position: { x: number; y: number } | null) {
    const currentState = this.awareness.getLocalState();
    this.awareness.setLocalState({
      ...currentState,
      cursor: position
    });
  }
  
  updateSelection(selection: Selection | null) {
    const currentState = this.awareness.getLocalState();
    this.awareness.setLocalState({
      ...currentState,
      selection
    });
  }
  
  destroy() {
    this.provider?.destroy();
    this.indexeddbProvider?.destroy();
    this.ydoc.destroy();
  }
}
```

### React Context for Collaboration
```typescript
interface CollaborationContextValue {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness: Awareness;
  isConnected: boolean;
  isSynced: boolean;
  collaborators: CollaboratorInfo[];
}

interface CollaboratorInfo {
  clientId: number;
  user: {
    id: string;
    name: string;
    avatar?: string;
    color: string;
  };
  cursor: { x: number; y: number } | null;
  selection: Selection | null;
  lastSeen: number;
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export const CollaborationProvider: React.FC<{
  documentId: string;
  userId: string;
  userInfo: UserInfo;
  children: React.ReactNode;
}> = ({ documentId, userId, userInfo, children }) => {
  const [manager] = useState(() => new CollaborationManager(documentId, userId, userInfo));
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  
  useEffect(() => {
    const provider = manager.provider;
    if (!provider) return;
    
    const handleStatus = (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    };
    
    const handleSync = (isSynced: boolean) => {
      setIsSynced(isSynced);
    };
    
    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    
    return () => {
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
    };
  }, [manager]);
  
  useEffect(() => {
    const awareness = manager.awareness;
    
    const handleAwarenessChange = () => {
      const states = Array.from(awareness.getStates().entries())
        .filter(([clientId]) => clientId !== awareness.clientID)
        .map(([clientId, state]) => ({
          clientId,
          user: state.user,
          cursor: state.cursor,
          selection: state.selection,
          lastSeen: Date.now()
        }));
      
      setCollaborators(states);
    };
    
    awareness.on('change', handleAwarenessChange);
    
    return () => {
      awareness.off('change', handleAwarenessChange);
    };
  }, [manager]);
  
  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);
  
  const value: CollaborationContextValue = {
    ydoc: manager.ydoc,
    provider: manager.provider,
    awareness: manager.awareness,
    isConnected,
    isSynced,
    collaborators
  };
  
  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
};

export const useCollaboration = () => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within CollaborationProvider');
  }
  return context;
};
```

### Yjs-Zustand Bridge
```typescript
import * as Y from 'yjs';
import { useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';

export const useYjsSync = () => {
  const { ydoc } = useCollaboration();
  const { loadDeck, updateSlide, addSlide, deleteSlide } = useEditorStore();
  
  useEffect(() => {
    const deckMap = ydoc.getMap('deck');
    const slidesArray = ydoc.getArray('slides');
    
    // Initial load from Yjs to Zustand
    const syncToZustand = () => {
      const deck: Deck = {
        id: deckMap.get('id') as string,
        title: deckMap.get('title') as string,
        theme: deckMap.get('theme') as Theme,
        slides: slidesArray.toArray().map(slideMap => ({
          id: slideMap.get('id'),
          order: slideMap.get('order'),
          layout: slideMap.get('layout'),
          elements: slideMap.get('elements'),
          background: slideMap.get('background'),
          transition: slideMap.get('transition'),
          notes: slideMap.get('notes')
        })),
        version: deckMap.get('version') as string,
        metadata: deckMap.get('metadata') as any
      };
      
      loadDeck(deck);
    };
    
    // Sync from Yjs to Zustand on changes
    const handleDeckChange = () => {
      syncToZustand();
    };
    
    const handleSlidesChange = () => {
      syncToZustand();
    };
    
    deckMap.observe(handleDeckChange);
    slidesArray.observe(handleSlidesChange);
    
    // Initial sync
    if (deckMap.size > 0) {
      syncToZustand();
    }
    
    return () => {
      deckMap.unobserve(handleDeckChange);
      slidesArray.unobserve(handleSlidesChange);
    };
  }, [ydoc, loadDeck]);
  
  // Sync from Zustand to Yjs
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (!state.deck) return;
      
      const deckMap = ydoc.getMap('deck');
      const slidesArray = ydoc.getArray('slides');
      
      ydoc.transact(() => {
        // Update deck metadata
        deckMap.set('id', state.deck.id);
        deckMap.set('title', state.deck.title);
        deckMap.set('theme', state.deck.theme);
        deckMap.set('version', state.deck.version);
        deckMap.set('metadata', state.deck.metadata);
        
        // Update slides
        const newSlides = state.deck.slides.map(slide => {
          const slideMap = new Y.Map();
          slideMap.set('id', slide.id);
          slideMap.set('order', slide.order);
          slideMap.set('layout', slide.layout);
          slideMap.set('elements', slide.elements);
          slideMap.set('background', slide.background);
          slideMap.set('transition', slide.transition);
          slideMap.set('notes', slide.notes);
          return slideMap;
        });
        
        // Replace slides array
        slidesArray.delete(0, slidesArray.length);
        slidesArray.insert(0, newSlides);
      });
    });
    
    return unsubscribe;
  }, [ydoc]);
};
```

## Presence & Cursors

### Cursor Overlay Component
```typescript
import { motion } from 'framer-motion';

interface CursorOverlayProps {
  collaborators: CollaboratorInfo[];
  zoom: number;
}

export const CursorOverlay: React.FC<CursorOverlayProps> = ({ collaborators, zoom }) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {collaborators.map(collaborator => {
        if (!collaborator.cursor) return null;
        
        return (
          <motion.div
            key={collaborator.clientId}
            className="absolute"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: collaborator.cursor.x * zoom,
              y: collaborator.cursor.y * zoom
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: collaborator.user.color }}
            >
              <path
                d="M5.65376 12.3673L10.6582 17.3717L12.2705 19L13.9023 17.3611L18.9029 12.3673C19.6542 11.6159 20.0292 10.5764 19.9297 9.51845C19.8303 8.46048 19.2668 7.49458 18.3731 6.88029C17.4794 6.266 16.3457 6.06805 15.2704 6.33822C14.1951 6.60838 13.278 7.32313 12.7273 8.31532L12 9.5L11.2727 8.31532C10.722 7.32313 9.80489 6.60838 8.72956 6.33822C7.65423 6.06805 6.52056 6.266 5.62685 6.88029C4.73314 7.49458 4.16968 8.46048 4.07024 9.51845C3.97081 10.5764 4.34584 11.6159 5.09712 12.3673H5.65376Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            
            <div
              className="ml-6 -mt-1 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
              style={{ backgroundColor: collaborator.user.color }}
            >
              {collaborator.user.name}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
```

### Cursor Tracking Hook
```typescript
export const useCursorTracking = (containerRef: RefObject<HTMLDivElement>) => {
  const { awareness } = useCollaboration();
  const { zoom } = useEditorStore();
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      
      awareness.setLocalStateField('cursor', { x, y });
    };
    
    const handleMouseLeave = () => {
      awareness.setLocalStateField('cursor', null);
    };
    
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [awareness, zoom, containerRef]);
};
```

### Selection Highlighting
```typescript
interface SelectionOverlayProps {
  collaborators: CollaboratorInfo[];
  zoom: number;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ collaborators, zoom }) => {
  const { deck } = useEditorStore();
  
  const getElementBounds = (slideId: string, elementId: string) => {
    const slide = deck?.slides.find(s => s.id === slideId);
    const element = slide?.elements.find(e => e.id === elementId);
    
    if (!element) return null;
    
    return {
      x: element.position.x,
      y: element.position.y,
      width: element.size.width,
      height: element.size.height
    };
  };
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {collaborators.map(collaborator => {
        if (!collaborator.selection?.elementId) return null;
        
        const bounds = getElementBounds(
          collaborator.selection.slideId,
          collaborator.selection.elementId
        );
        
        if (!bounds) return null;
        
        return (
          <motion.div
            key={`${collaborator.clientId}-selection`}
            className="absolute border-2 rounded"
            style={{
              left: bounds.x * zoom,
              top: bounds.y * zoom,
              width: bounds.width * zoom,
              height: bounds.height * zoom,
              borderColor: collaborator.user.color,
              boxShadow: `0 0 0 2px ${collaborator.user.color}33`
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute -top-6 left-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
              style={{ backgroundColor: collaborator.user.color }}
            >
              {collaborator.user.name}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
```

## Active Users Panel

### Active Users Component
```typescript
interface ActiveUsersProps {
  collaborators: CollaboratorInfo[];
  maxDisplay?: number;
}

export const ActiveUsers: React.FC<ActiveUsersProps> = ({
  collaborators,
  maxDisplay = 5
}) => {
  const displayedUsers = collaborators.slice(0, maxDisplay);
  const remainingCount = Math.max(0, collaborators.length - maxDisplay);
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {displayedUsers.map(collaborator => (
          <Avatar
            key={collaborator.clientId}
            className="w-8 h-8 border-2 border-white"
            style={{ borderColor: collaborator.user.color }}
          >
            {collaborator.user.avatar ? (
              <AvatarImage src={collaborator.user.avatar} alt={collaborator.user.name} />
            ) : (
              <AvatarFallback style={{ backgroundColor: collaborator.user.color }}>
                {collaborator.user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        ))}
        
        {remainingCount > 0 && (
          <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium">
            +{remainingCount}
          </div>
        )}
      </div>
      
      <span className="text-sm text-gray-600">
        {collaborators.length} {collaborators.length === 1 ? 'user' : 'users'} online
      </span>
    </div>
  );
};
```

## Connection Status Indicator

### Connection Status Component
```typescript
export const ConnectionStatus: React.FC = () => {
  const { isConnected, isSynced } = useCollaboration();
  const [showReconnecting, setShowReconnecting] = useState(false);
  
  useEffect(() => {
    if (!isConnected) {
      const timer = setTimeout(() => setShowReconnecting(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowReconnecting(false);
    }
  }, [isConnected]);
  
  if (isConnected && isSynced) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <div className="w-2 h-2 rounded-full bg-green-600" />
        <span>Connected</span>
      </div>
    );
  }
  
  if (isConnected && !isSynced) {
    return (
      <div className="flex items-center gap-2 text-sm text-yellow-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 text-sm text-red-600">
      <WifiOff className="w-4 h-4" />
      <span>{showReconnecting ? 'Reconnecting...' : 'Disconnected'}</span>
    </div>
  );
};
```

## Conflict Resolution

### Merge Strategy for Elements
```typescript
export const mergeElements = (
  localElements: SlideElement[],
  remoteElements: SlideElement[]
): SlideElement[] => {
  const merged = new Map<string, SlideElement>();
  
  // Add all local elements
  localElements.forEach(el => merged.set(el.id, el));
  
  // Merge remote elements
  remoteElements.forEach(remoteEl => {
    const localEl = merged.get(remoteEl.id);
    
    if (!localEl) {
      // New element from remote
      merged.set(remoteEl.id, remoteEl);
    } else {
      // Conflict: merge based on last write wins (LWW)
      const mergedEl = mergeElementProperties(localEl, remoteEl);
      merged.set(remoteEl.id, mergedEl);
    }
  });
  
  return Array.from(merged.values()).sort((a, b) => a.zIndex - b.zIndex);
};

function mergeElementProperties(
  local: SlideElement,
  remote: SlideElement
): SlideElement {
  // Custom merge logic based on property type
  return {
    ...remote,
    // Preserve local edits for text content if user is actively editing
    content: local.content.type === 'text' && isActivelyEditing(local.id)
      ? local.content
      : remote.content
  };
}
```

## Offline Support

### Offline Queue Management
```typescript
class OfflineQueue {
  private queue: Array<{ type: string; payload: any; timestamp: number }> = [];
  
  constructor() {
    this.loadFromStorage();
    window.addEventListener('online', () => this.flush());
  }
  
  enqueue(type: string, payload: any) {
    this.queue.push({
      type,
      payload,
      timestamp: Date.now()
    });
    this.saveToStorage();
  }
  
  async flush() {
    if (!navigator.onLine || this.queue.length === 0) return;
    
    const items = [...this.queue];
    this.queue = [];
    this.saveToStorage();
    
    for (const item of items) {
      try {
        await this.processItem(item);
      } catch (error) {
        console.error('Failed to process queued item:', error);
        this.queue.push(item); // Re-queue on failure
      }
    }
  }
  
  private async processItem(item: { type: string; payload: any }) {
    // Process based on type
    switch (item.type) {
      case 'element.update':
        // Apply element update
        break;
      case 'slide.add':
        // Apply slide addition
        break;
      // ... other cases
    }
  }
  
  private loadFromStorage() {
    const stored = localStorage.getItem('offline-queue');
    if (stored) {
      this.queue = JSON.parse(stored);
    }
  }
  
  private saveToStorage() {
    localStorage.setItem('offline-queue', JSON.stringify(this.queue));
  }
}
```

## Performance Optimizations

### Throttled Awareness Updates
```typescript
import { throttle } from 'lodash-es';

export const useThrottledAwareness = () => {
  const { awareness } = useCollaboration();
  
  const updateCursor = useMemo(
    () => throttle((position: { x: number; y: number } | null) => {
      awareness.setLocalStateField('cursor', position);
    }, 50), // 20 updates per second max
    [awareness]
  );
  
  const updateSelection = useMemo(
    () => throttle((selection: Selection | null) => {
      awareness.setLocalStateField('selection', selection);
    }, 100),
    [awareness]
  );
  
  return { updateCursor, updateSelection };
};
```

### Optimistic Updates
```typescript
export const useOptimisticUpdate = () => {
  const { ydoc } = useCollaboration();
  
  const optimisticUpdate = useCallback((
    updateFn: (doc: Y.Doc) => void,
    rollbackFn?: () => void
  ) => {
    try {
      ydoc.transact(() => {
        updateFn(ydoc);
      });
    } catch (error) {
      console.error('Optimistic update failed:', error);
      if (rollbackFn) rollbackFn();
    }
  }, [ydoc]);
  
  return optimisticUpdate;
};
```

## Testing Strategy

### Mock Collaboration Provider
```typescript
export const MockCollaborationProvider: React.FC<{
  children: React.ReactNode;
  initialCollaborators?: CollaboratorInfo[];
}> = ({ children, initialCollaborators = [] }) => {
  const [collaborators, setCollaborators] = useState(initialCollaborators);
  
  const mockValue: CollaborationContextValue = {
    ydoc: new Y.Doc(),
    provider: null,
    awareness: new Awareness(new Y.Doc()),
    isConnected: true,
    isSynced: true,
    collaborators
  };
  
  return (
    <CollaborationContext.Provider value={mockValue}>
      {children}
    </CollaborationContext.Provider>
  );
};
```

### Integration Tests
```typescript
describe('Real-time Collaboration', () => {
  it('syncs element updates between users', async () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    
    // Simulate network sync
    doc1.on('update', (update: Uint8Array) => {
      Y.applyUpdate(doc2, update);
    });
    
    doc2.on('update', (update: Uint8Array) => {
      Y.applyUpdate(doc1, update);
    });
    
    // User 1 adds element
    const slides1 = doc1.getArray('slides');
    const slideMap1 = new Y.Map();
    slideMap1.set('id', 'slide-1');
    slideMap1.set('elements', [
      { id: 'el-1', type: 'text', content: 'Hello' }
    ]);
    slides1.push([slideMap1]);
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // User 2 should see the element
    const slides2 = doc2.getArray('slides');
    expect(slides2.length).toBe(1);
    expect(slides2.get(0).get('elements')).toHaveLength(1);
  });
  
  it('handles concurrent element updates', async () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    
    // Set up bidirectional sync
    setupBidirectionalSync(doc1, doc2);
    
    // Both users update the same element simultaneously
    const slides1 = doc1.getArray('slides');
    const slides2 = doc2.getArray('slides');
    
    slides1.get(0).set('title', 'Title from User 1');
    slides2.get(0).set('title', 'Title from User 2');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Both documents should converge to the same state
    expect(slides1.get(0).get('title')).toBe(slides2.get(0).get('title'));
  });
});
```

## Security Considerations

### Authorization Checks
```typescript
export const validateCollaborationAccess = async (
  documentId: string,
  userId: string
): Promise<boolean> => {
  try {
    const response = await api.get(`/documents/${documentId}/permissions`);
    const permissions = response.data.permissions;
    
    return ['owner', 'editor', 'commenter', 'viewer'].includes(permissions.role);
  } catch (error) {
    console.error('Permission check failed:', error);
    return false;
  }
};
```

### Message Validation
```typescript
export const validateYjsUpdate = (update: Uint8Array): boolean => {
  try {
    // Basic validation of Yjs update structure
    const decoder = new Y.UpdateDecoder(update);
    
    // Check update size (prevent DoS)
    if (update.length > 1024 * 1024) { // 1MB max
      console.warn('Update too large');
      return false;
    }
    
    // Validate structure
    decoder.readDsClockLen();
    
    return true;
  } catch (error) {
    console.error('Invalid Yjs update:', error);
    return false;
  }
};
```

## Future Enhancements

- **Voice/Video Integration**: WebRTC for real-time communication
- **Comments Thread**: Threaded comments with mentions
- **Version History**: Time-travel debugging with Yjs snapshots
- **Fine-grained Permissions**: Element-level access control
- **Presence Indicators**: Typing indicators, viewport tracking
- **Conflict UI**: Visual conflict resolution interface
- **Mobile Optimization**: Touch-friendly cursors and gestures
- **Analytics**: Collaboration metrics and engagement tracking
