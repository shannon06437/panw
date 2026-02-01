'use client'

import React, { useState, useRef, useEffect } from 'react'

interface DropdownItem {
  label: string
  onClick: () => void
  icon?: string
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {isOpen && (
        <div
          className="dropdown-menu"
          style={{
            position: 'absolute',
            top: '100%',
            [align]: 0,
            marginTop: '0.5rem',
            zIndex: 1000,
          }}
        >
          {items.map((item, index) => (
            <div
              key={index}
              className="dropdown-item"
              onClick={() => {
                item.onClick()
                setIsOpen(false)
              }}
            >
              {item.icon && <span style={{ marginRight: '0.5rem' }}>{item.icon}</span>}
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
