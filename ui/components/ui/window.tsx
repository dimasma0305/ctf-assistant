"use client"

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { X, Minus, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface WindowState {
  id: string
  isMinimized: boolean
  isMaximized: boolean // Added maximized state
  position: { x: number; y: number }
  size: { width: number; height: number }
  normalPosition?: { x: number; y: number } // Store normal position for restore
  normalSize?: { width: number; height: number } // Store normal size for restore
  zIndex: number
  title: string
}

interface WindowContextType {
  windows: WindowState[]
  openWindow: (id: string, title: string) => void
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  maximizeWindow: (id: string) => void // Added maximize function
  bringToFront: (id: string) => void
  updateWindow: (id: string, updates: Partial<WindowState>) => void
  handleWindowMouseEnter: () => void
  handleWindowMouseLeave: () => void
  minimizeAllWindows: () => void // Added function to minimize all windows
}

const WindowContext = React.createContext<WindowContextType | null>(null)

export function WindowProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const [nextZIndex, setNextZIndex] = useState(1000)
  const [isMouseOverWindow, setIsMouseOverWindow] = useState(false)
  const mouseOverWindowRef = useRef(false)

  useEffect(() => {
    const openWindows = windows.filter((w) => !w.isMinimized)

    if (openWindows.length > 0 && isMouseOverWindow) {
      const originalOverflow = document.body.style.overflow
      const originalPaddingRight = document.body.style.paddingRight

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

      document.body.style.overflow = "hidden"
      document.body.style.paddingRight = `${scrollbarWidth}px`

      return () => {
        document.body.style.overflow = originalOverflow
        document.body.style.paddingRight = originalPaddingRight
      }
    }
  }, [windows, isMouseOverWindow])

  const handleWindowMouseEnter = useCallback(() => {
    mouseOverWindowRef.current = true
    setIsMouseOverWindow(true)
  }, [])

  const handleWindowMouseLeave = useCallback(() => {
    mouseOverWindowRef.current = false
    setTimeout(() => {
      if (!mouseOverWindowRef.current) {
        setIsMouseOverWindow(false)
      }
    }, 50)
  }, [])

  const openWindow = useCallback(
    (id: string, title: string) => {
      setWindows((prev) => {
        const existing = prev.find((w) => w.id === id)
        if (existing) {
          const newZIndex = nextZIndex + 1
          setNextZIndex(newZIndex + 1)
          return prev.map((w) => (w.id === id ? { ...w, isMinimized: false, zIndex: newZIndex } : w))
        }

        const windowWidth = 800
        const windowHeight = 600
        const screenWidth =
          typeof globalThis.window !== "undefined" && globalThis.window.innerWidth ? globalThis.window.innerWidth : 1200
        const screenHeight =
          typeof globalThis.window !== "undefined" && globalThis.window.innerHeight
            ? globalThis.window.innerHeight
            : 800

        // Center the window with a small offset for multiple windows
        const windowIndex = prev.length
        const offsetMultiplier = windowIndex * 30 // 30px offset for each additional window
        
        const centerX = (screenWidth - windowWidth) / 2
        const centerY = (screenHeight - windowHeight) / 2
        
        const positionX = Math.max(0, Math.min(screenWidth - windowWidth, centerX + offsetMultiplier))
        const positionY = Math.max(0, Math.min(screenHeight - windowHeight, centerY + offsetMultiplier))

        const newWindow: WindowState = {
          id,
          title,
          isMinimized: false,
          isMaximized: false, // Initialize maximized state
          position: {
            x: isNaN(positionX) ? 50 : positionX,
            y: isNaN(positionY) ? 50 : positionY,
          },
          size: { width: windowWidth, height: windowHeight },
          zIndex: nextZIndex + 1,
        }

        setNextZIndex((curr) => curr + 1)
        return [...prev, newWindow]
      })
    },
    [nextZIndex],
  )

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    console.log("[v0] Minimizing window:", id)
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)))
  }, [])

  const restoreWindow = useCallback(
    (id: string) => {
      console.log("[v0] Restoring window:", id)
      const newZIndex = nextZIndex + 1
      setNextZIndex(newZIndex + 1)
      setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMinimized: false, zIndex: newZIndex } : w)))
    },
    [nextZIndex],
  )

  const maximizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          if (w.isMaximized) {
            // Restore to normal size
            return {
              ...w,
              isMaximized: false,
              position: w.normalPosition || w.position,
              size: w.normalSize || w.size,
              normalPosition: undefined,
              normalSize: undefined,
            }
          } else {
            // Maximize to full width
            const screenWidth =
              typeof globalThis.window !== "undefined" && globalThis.window.innerWidth
                ? globalThis.window.innerWidth
                : 1200
            const screenHeight =
              typeof globalThis.window !== "undefined" && globalThis.window.innerHeight
                ? globalThis.window.innerHeight
                : 800

            return {
              ...w,
              isMaximized: true,
              normalPosition: w.position,
              normalSize: w.size,
              position: { x: 0, y: 0 },
              size: { width: screenWidth, height: screenHeight },
            }
          }
        }
        return w
      }),
    )
  }, [])

  const bringToFront = useCallback(
    (id: string) => {
      const newZIndex = nextZIndex + 1
      setNextZIndex(newZIndex + 1)
      setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, zIndex: newZIndex } : w)))
    },
    [nextZIndex],
  )

  const updateWindow = useCallback((id: string, updates: Partial<WindowState>) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)))
  }, [])

  const minimizeAllWindows = useCallback(() => {
    console.log("[v0] Minimizing all windows")
    setWindows((prev) => prev.map((w) => ({ ...w, isMinimized: true })))
  }, [])

  const handleBackdropClick = useCallback(() => {
    const openWindows = windows.filter((w) => !w.isMinimized)
    if (openWindows.length > 0) {
      openWindows.forEach((window) => {
        closeWindow(window.id)
      })
    }
  }, [windows, closeWindow])

  return (
    <WindowContext.Provider
      value={{
        windows,
        openWindow,
        closeWindow,
        minimizeWindow,
        restoreWindow,
        maximizeWindow, // Added maximize function to context
        bringToFront,
        updateWindow,
        handleWindowMouseEnter,
        handleWindowMouseLeave,
        minimizeAllWindows, // Added to context
      }}
    >
      {children}
      <WindowBackdrop onClick={handleBackdropClick} />
      <WindowTaskbar />
    </WindowContext.Provider>
  )
}

function WindowBackdrop({ onClick }: { onClick: () => void }) {
  const { windows } = useWindow()
  const openWindows = windows.filter((w) => !w.isMinimized)

  if (openWindows.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-[998] bg-black/5 backdrop-blur-[0.5px] transition-all duration-200"
      onClick={onClick}
      style={{ pointerEvents: "auto" }}
    />
  )
}

export function useWindow() {
  const context = React.useContext(WindowContext)
  if (!context) {
    throw new Error("useWindow must be used within a WindowProvider")
  }
  return context
}

function WindowTaskbar() {
  const { windows, restoreWindow, closeWindow } = useWindow()
  const minimizedWindows = windows.filter((w) => w.isMinimized)

  if (minimizedWindows.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] flex gap-2 flex-wrap md:left-auto md:right-4 md:w-auto">
      {minimizedWindows.map((window) => (
        <Button
          key={window.id}
          variant="secondary"
          size="sm"
          className="flex items-center gap-2 max-w-48 truncate animate-in slide-in-from-bottom-2 duration-300"
          onClick={() => {
            console.log("[v0] Taskbar button clicked for window:", window.id)
            restoreWindow(window.id)
          }}
        >
          <span className="truncate">{window.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => {
              e.stopPropagation()
              console.log("[v0] Taskbar close button clicked for window:", window.id)
              closeWindow(window.id)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </Button>
      ))}
    </div>
  )
}

interface WindowProps {
  id: string
  title: string
  children: React.ReactNode
  trigger?: React.ReactNode
  className?: string
  defaultSize?: { width: number; height: number }
  minSize?: { width: number; height: number }
  maxSize?: { width: number; height: number }
  isOpen: boolean
  onOpenChange?: (open: boolean) => void
}

export function Window({
  id,
  title,
  children,
  trigger,
  className,
  defaultSize = { width: 800, height: 600 },
  minSize = { width: 320, height: 200 },
  maxSize,
  isOpen: externalIsOpen,
  onOpenChange,
}: WindowProps) {
  const {
    windows,
    openWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    bringToFront,
    updateWindow,
    handleWindowMouseEnter,
    handleWindowMouseLeave,
  } = useWindow()
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const dragPositionRef = useRef({ x: 0, y: 0 })
  const resizeDimensionsRef = useRef({ width: 0, height: 0 })
  const windowRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const isHandlingExternalChange = useRef(false)
  const animationFrameRef = useRef<number>()
  const isMountedRef = useRef(true)
  const [dragPreview, setDragPreview] = useState({ x: 0, y: 0 })
  const [resizePreview, setResizePreview] = useState({ width: 0, height: 0 })
  const [resizeOffset, setResizeOffset] = useState({ width: 0, height: 0 }) // Declare resizeOffset variable

  const window = windows.find((w) => w.id === id)
  const isOpen = !!window && !window.isMinimized

  useEffect(() => {
    setIsClient(true)
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (externalIsOpen !== undefined && !isHandlingExternalChange.current) {
      isHandlingExternalChange.current = true

      if (externalIsOpen && !isOpen) {
        openWindow(id, title)
      } else if (!externalIsOpen && isOpen) {
        closeWindow(id)
      }

      setTimeout(() => {
        isHandlingExternalChange.current = false
      }, 0)
    }
  }, [externalIsOpen, id, title])

  useEffect(() => {
    if (onOpenChange && !isHandlingExternalChange.current) {
      onOpenChange(isOpen)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isClient) return

    const checkMobile = () => {
      const mobile = globalThis.window.innerWidth < 768
      setIsMobile(mobile)
    }
    checkMobile()
    globalThis.window.addEventListener("resize", checkMobile)
    return () => globalThis.window.removeEventListener("resize", checkMobile)
  }, [isClient])

  useEffect(() => {
    if (window && !window.size.width && !window.size.height && defaultSize) {
      updateWindow(id, { size: defaultSize })
    }
  }, [window, id, defaultSize])

  const actualMaxSize = maxSize || {
    width: isClient ? globalThis.window.innerWidth : 1200,
    height: isClient ? globalThis.window.innerHeight : 800,
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (isMobile || window?.isMaximized) return

      const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : "clientX" in e ? e.clientX : 0
      const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : "clientY" in e ? e.clientY : 0

      if (isNaN(clientX) || isNaN(clientY)) return

      setIsDragging(true)
      setDragStart({
        x: clientX - (window?.position.x || 0),
        y: clientY - (window?.position.y || 0),
      })
      dragPositionRef.current = { x: window?.position.x || 0, y: window?.position.y || 0 }
      setDragPreview({ x: window?.position.x || 0, y: window?.position.y || 0 })
      bringToFront(id)
    },
    [window?.position, window?.isMaximized, bringToFront, id, isMobile],
  )

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (isMobile || window?.isMaximized) return

      e.stopPropagation()
      const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : "clientX" in e ? e.clientX : 0
      const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : "clientY" in e ? e.clientY : 0

      if (isNaN(clientX) || isNaN(clientY)) return

      setIsResizing(true)
      setResizeStart({
        x: clientX,
        y: clientY,
        width: window?.size.width || defaultSize.width,
        height: window?.size.height || defaultSize.height,
      })
      resizeDimensionsRef.current = {
        width: window?.size.width || defaultSize.width,
        height: window?.size.height || defaultSize.height,
      }
      setResizePreview({
        width: window?.size.width || defaultSize.width,
        height: window?.size.height || defaultSize.height,
      })
    },
    [window?.size, window?.isMaximized, defaultSize, isMobile],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : "clientX" in e ? e.clientX : 0
        const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : "clientY" in e ? e.clientY : 0

        if (isNaN(clientX) || isNaN(clientY)) return

        if (isDragging && window) {
          const maxX = isClient ? globalThis.window.innerWidth - 100 : 1100
          const maxY = isClient ? globalThis.window.innerHeight - 50 : 750
          const newX = Math.max(0, Math.min(maxX, clientX - dragStart.x))
          const newY = Math.max(0, Math.min(maxY, clientY - dragStart.y))

          if (!isNaN(newX) && !isNaN(newY)) {
            dragPositionRef.current = { x: newX, y: newY }
            setDragPreview({ x: newX, y: newY })
          }
        }

        if (isResizing && window) {
          const newWidth = Math.max(
            minSize.width,
            Math.min(actualMaxSize.width, resizeStart.width + (clientX - resizeStart.x)),
          )
          const newHeight = Math.max(
            minSize.height,
            Math.min(actualMaxSize.height, resizeStart.height + (clientY - resizeStart.y)),
          )

          if (!isNaN(newWidth) && !isNaN(newHeight)) {
            resizeDimensionsRef.current = { width: newWidth, height: newHeight }
            setResizePreview({ width: newWidth, height: newHeight })
            setResizeOffset({
              width: newWidth - (resizeStart.width || defaultSize.width),
              height: newHeight - (resizeStart.height || defaultSize.height),
            }) // Update resizeOffset
          }
        }
      })
    }

    const handleMouseUp = () => {
      if (isDragging && window) {
        const finalPosition = dragPositionRef.current
        if (finalPosition.x !== window.position.x || finalPosition.y !== window.position.y) {
          updateWindow(id, { position: finalPosition })
        }
      }

      if (isResizing && window) {
        const finalSize = resizeDimensionsRef.current
        if (finalSize.width !== window.size.width || finalSize.height !== window.size.height) {
          updateWindow(id, { size: finalSize })
        }
      }

      setIsDragging(false)
      setIsResizing(false)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove, { passive: true })
      document.addEventListener("mouseup", handleMouseUp)
      document.addEventListener("touchmove", handleMouseMove, { passive: true })
      document.addEventListener("touchend", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("touchmove", handleMouseMove)
      document.removeEventListener("touchend", handleMouseUp)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [
    isDragging,
    isResizing,
    dragStart,
    resizeStart,
    window,
    id,
    minSize,
    actualMaxSize,
    updateWindow,
    isClient,
    defaultSize,
  ])

  if (!isClient) {
    return null
  }

  if (!isOpen && trigger) {
    return <div onClick={() => openWindow(id, title)}>{trigger}</div>
  }

  if (!isMountedRef.current && window && !window.isMinimized) {
    return (
      <div
        className={cn("fixed bg-background border rounded-lg shadow-2xl flex flex-col", className)}
        style={{
          left: isNaN(window.position.x) ? 0 : window.position.x,
          top: isNaN(window.position.y) ? 0 : window.position.y,
          width: isNaN(window.size.width) ? defaultSize.width : window.size.width,
          height: isNaN(window.size.height) ? defaultSize.height : window.size.height,
          zIndex: window.zIndex,
          minWidth: minSize.width,
          minHeight: minSize.height,
          maxWidth: actualMaxSize.width,
          maxHeight: actualMaxSize.height,
        }}
        onClick={() => bringToFront(id)}
        onMouseEnter={handleWindowMouseEnter}
        onMouseLeave={handleWindowMouseLeave}
      >
        <div className="flex items-center justify-between p-3 border-b bg-muted/50 rounded-t-lg select-none">
          <h2 className="font-semibold truncate flex-1">{title}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => minimizeWindow(id)}
              className="h-6 w-6 p-0 hover:bg-yellow-500/20"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => closeWindow(id)}
              className="h-6 w-6 p-0 hover:bg-red-500/20"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">Window content unavailable</p>
            <p className="text-xs mt-1">Navigate back to CTF Rankings to restore content</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isOpen) {
    return null
  }

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[9998] bg-background flex flex-col"
        style={{ zIndex: window.zIndex }}
        onMouseEnter={handleWindowMouseEnter}
        onMouseLeave={handleWindowMouseLeave}
      >
        <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur flex-shrink-0">
          <h2 className="font-semibold truncate flex-1">{title}</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => minimizeWindow(id)} className="h-8 w-8 p-0">
              <Minus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => closeWindow(id)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto overscroll-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            height: "calc(100vh - 73px)", // Account for header height
          }}
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={windowRef}
      className={cn(
        "fixed bg-background border rounded-lg shadow-2xl flex flex-col",
        !isDragging && !isResizing && "transition-all duration-200 ease-out",
        isDragging && "cursor-move shadow-3xl ring-2 ring-primary/20 scale-[1.02]",
        isResizing && "shadow-3xl ring-2 ring-blue-500/20",
        window?.isMaximized && "!rounded-none",
        className,
      )}
      style={{
        left: isDragging ? dragPreview.x : isNaN(window?.position.x || 0) ? 0 : window?.position.x,
        top: isDragging ? dragPreview.y : isNaN(window?.position.y || 0) ? 0 : window?.position.y,
        width: isResizing
          ? resizePreview.width
          : isNaN(window?.size.width || 0)
            ? defaultSize.width
            : window?.size.width,
        height: isResizing
          ? resizePreview.height
          : isNaN(window?.size.height || 0)
            ? defaultSize.height
            : window?.size.height,
        zIndex: window.zIndex,
        minWidth: window?.isMaximized ? "auto" : minSize.width,
        minHeight: window?.isMaximized ? "auto" : minSize.height,
        maxWidth: window?.isMaximized ? "none" : actualMaxSize.width,
        maxHeight: window?.isMaximized ? "none" : actualMaxSize.height,
        backdropFilter: isDragging || isResizing ? "blur(1px)" : "none",
      }}
      onClick={(e) => {
        e.stopPropagation()
        bringToFront(id)
      }}
      onMouseEnter={handleWindowMouseEnter}
      onMouseLeave={handleWindowMouseLeave}
    >
      <div
        className={cn(
          "flex items-center justify-between p-3 border-b bg-muted/50 rounded-t-lg select-none",
          window?.isMaximized ? "cursor-default !rounded-none" : "cursor-move",
          isDragging && "bg-primary/10 border-primary/20",
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <h2 className="font-semibold truncate flex-1">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => maximizeWindow(id)}
            className="h-6 w-6 p-0 hover:bg-blue-500/20 transition-colors duration-150"
            title={window?.isMaximized ? "Restore" : "Maximize"}
          >
            {window?.isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => minimizeWindow(id)}
            className="h-6 w-6 p-0 hover:bg-yellow-500/20 transition-colors duration-150"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => closeWindow(id)}
            className="h-6 w-6 p-0 hover:bg-red-500/20 transition-colors duration-150"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">{children}</div>

      {!window?.isMaximized && (
        <div
          className={cn(
            "absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity duration-150",
            isResizing && "opacity-100 scale-125",
          )}
          onMouseDown={handleResizeMouseDown}
          onTouchStart={handleResizeMouseDown}
        >
          <div
            className={cn(
              "absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground transition-colors duration-150",
              isResizing && "border-blue-500",
            )}
          />
        </div>
      )}
    </div>
  )
}
