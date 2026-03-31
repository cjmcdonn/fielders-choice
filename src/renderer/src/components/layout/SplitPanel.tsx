import { useState, useRef, useCallback } from 'react'

interface SplitPanelProps {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

export default function SplitPanel({
  left,
  right,
  defaultLeftWidth = 420,
  minLeftWidth = 320,
  minRightWidth = 400
}: SplitPanelProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const newWidth = Math.max(minLeftWidth, Math.min(e.clientX, window.innerWidth - minRightWidth))
      setLeftWidth(newWidth)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [minLeftWidth, minRightWidth])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-shrink-0 overflow-y-auto" style={{ width: leftWidth }}>
        {left}
      </div>
      <div
        className="w-2 bg-[#e8e0d6] hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="flex-1 overflow-hidden">
        {right}
      </div>
    </div>
  )
}
