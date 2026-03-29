import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  onUpload: (base64: string, mimeType: string) => void;
  isProcessing: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isProcessing }) => {
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      onUpload(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'text/plain': ['.txt']
    },
    multiple: false,
    disabled: isProcessing
  } as any);

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
        isDragActive ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
    >
      <input {...getInputProps()} />
      
      {isProcessing ? (
        <>
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="font-medium text-slate-900">생활기록부 분석 중...</p>
            <p className="text-sm text-slate-500">AI가 내용을 읽고 평가 항목을 작성하고 있습니다.</p>
          </div>
        </>
      ) : fileName ? (
        <>
          <CheckCircle2 className="w-10 h-10 text-accent-green" />
          <div className="text-center">
            <p className="font-medium text-slate-900">{fileName}</p>
            <p className="text-sm text-slate-500">클릭하여 다른 파일 업로드</p>
          </div>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Upload className="w-6 h-6 text-slate-500" />
          </div>
          <div className="text-center">
            <p className="font-medium text-slate-900">생활기록부 업로드</p>
            <p className="text-sm text-slate-500">PDF, 이미지 또는 텍스트 파일을 드래그하거나 클릭하세요.</p>
          </div>
        </>
      )}
    </div>
  );
};
