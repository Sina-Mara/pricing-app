import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, X, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface ExcelUploaderProps {
  onFileSelect: (file: File) => void
  onTemplateDownload: () => void
  isLoading?: boolean
  error?: string | null
  accept?: string
}

export function ExcelUploader({
  onFileSelect,
  onTemplateDownload,
  isLoading = false,
  error = null,
  accept = '.xlsx,.xls,.csv'
}: ExcelUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      setSelectedFile(file)
      onFileSelect(file)
    }
  }, [onFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      setSelectedFile(file)
      onFileSelect(file)
    }
  }, [onFileSelect])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleClearFile = useCallback(() => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isLoading && 'pointer-events-none opacity-50'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center text-center">
          <div className={cn(
            'mb-4 rounded-full p-3',
            isDragging ? 'bg-primary/10' : 'bg-muted'
          )}>
            <Upload className={cn(
              'h-8 w-8',
              isDragging ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>

          <p className="mb-2 text-sm font-medium">
            {isDragging ? 'Drop your file here' : 'Drag and drop your Excel file'}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            or click to browse
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={handleBrowseClick}
            disabled={isLoading}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Select File
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Supports .xlsx, .xls, and .csv files
          </p>
        </div>
      </div>

      {/* Selected File Display */}
      {selectedFile && !error && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClearFile}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Template Download */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
        <div>
          <p className="text-sm font-medium">Need a template?</p>
          <p className="text-xs text-muted-foreground">
            Download a pre-formatted Excel template with sample data
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTemplateDownload}
        >
          <Download className="mr-2 h-4 w-4" />
          Download Template
        </Button>
      </div>
    </div>
  )
}
