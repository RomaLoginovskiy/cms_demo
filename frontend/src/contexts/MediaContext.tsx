import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Media } from '../types';

interface MediaState {
  media: Media[];
  loading: boolean;
  error: string | null;
  selectedMedia: Media | null;
  availableTags: string[];
  selectedTags: string[];
}

type MediaAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_MEDIA'; payload: Media[] }
  | { type: 'ADD_MEDIA'; payload: Media }
  | { type: 'UPDATE_MEDIA'; payload: Media }
  | { type: 'DELETE_MEDIA'; payload: string }
  | { type: 'SELECT_MEDIA'; payload: Media | null }
  | { type: 'SET_AVAILABLE_TAGS'; payload: string[] }
  | { type: 'SET_SELECTED_TAGS'; payload: string[] }
  | { type: 'TOGGLE_TAG_FILTER'; payload: string }
  | { type: 'CLEAR_TAG_FILTERS' };

const initialState: MediaState = {
  media: [],
  loading: false,
  error: null,
  selectedMedia: null,
  availableTags: [],
  selectedTags: [],
};

function mediaReducer(state: MediaState, action: MediaAction): MediaState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_MEDIA':
      return { ...state, media: action.payload, loading: false, error: null };
    case 'ADD_MEDIA':
      return { ...state, media: [action.payload, ...state.media] };
    case 'UPDATE_MEDIA':
      return {
        ...state,
        media: state.media.map(item =>
          item.id === action.payload.id ? action.payload : item
        ),
        selectedMedia: state.selectedMedia?.id === action.payload.id
          ? action.payload
          : state.selectedMedia,
      };
    case 'DELETE_MEDIA':
      return {
        ...state,
        media: state.media.filter(item => item.id !== action.payload),
        selectedMedia: state.selectedMedia?.id === action.payload
          ? null
          : state.selectedMedia,
      };
    case 'SELECT_MEDIA':
      return { ...state, selectedMedia: action.payload };
    case 'SET_AVAILABLE_TAGS':
      return { ...state, availableTags: action.payload };
    case 'SET_SELECTED_TAGS':
      return { ...state, selectedTags: action.payload };
    case 'TOGGLE_TAG_FILTER':
      return {
        ...state,
        selectedTags: state.selectedTags.includes(action.payload)
          ? state.selectedTags.filter(tag => tag !== action.payload)
          : [...state.selectedTags, action.payload],
      };
    case 'CLEAR_TAG_FILTERS':
      return { ...state, selectedTags: [] };
    default:
      return state;
  }
}

interface MediaContextType {
  state: MediaState;
  dispatch: React.Dispatch<MediaAction>;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export function MediaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(mediaReducer, initialState);

  return (
    <MediaContext.Provider value={{ state, dispatch }}>
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const context = useContext(MediaContext);
  if (context === undefined) {
    throw new Error('useMedia must be used within a MediaProvider');
  }
  return context;
} 