import React, { useState, useRef, KeyboardEvent } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maxTags?: number;
  maxTagLength?: number;
}

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = 'Add tags...',
  disabled = false,
  readOnly = false,
  maxTags = 10,
  maxTagLength = 50,
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tagValue: string) => {
    const trimmedTag = tagValue.trim();
    
    // Validate tag
    if (!trimmedTag) return;
    if (trimmedTag.length > maxTagLength) return;
    if (tags.length >= maxTags) return;
    
    // Check for duplicate (case-insensitive)
    const normalizedTag = trimmedTag.toLowerCase();
    if (tags.some(t => t.toLowerCase() === normalizedTag)) return;
    
    onChange([...tags, trimmedTag]);
    setInputValue('');
  };

  const removeTag = (indexToRemove: number) => {
    if (disabled || readOnly) return;
    onChange(tags.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // If comma is typed, add the tag
    if (value.includes(',')) {
      const parts = value.split(',');
      parts.forEach((part, index) => {
        if (index < parts.length - 1) {
          addTag(part);
        } else {
          setInputValue(part);
        }
      });
    } else {
      setInputValue(value);
    }
  };

  const handleContainerClick = () => {
    if (!disabled && !readOnly) {
      inputRef.current?.focus();
    }
  };

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-gray-400 text-sm italic">No tags</span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleContainerClick}
      className={`
        flex flex-wrap gap-2 p-2 min-h-[42px] border rounded-md transition-colors cursor-text
        ${disabled 
          ? 'bg-gray-100 border-gray-200 cursor-not-allowed' 
          : 'bg-white border-gray-300 hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent'
        }
      `}
    >
      {tags.map((tag, index) => (
        <span
          key={index}
          className={`
            inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium
            ${disabled 
              ? 'bg-gray-200 text-gray-600' 
              : 'bg-blue-100 text-blue-800'
            }
          `}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-blue-200 transition-colors focus:outline-none"
              aria-label={`Remove ${tag}`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </span>
      ))}
      
      {!disabled && tags.length < maxTags && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] px-1 py-1 text-sm bg-transparent border-none outline-none focus:ring-0 placeholder-gray-400"
        />
      )}
    </div>
  );
};

export default TagInput;

