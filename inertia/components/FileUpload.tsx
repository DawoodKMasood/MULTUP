import { FilePond } from 'react-filepond';
import type { FilePondFile, FilePondErrorDescription, ActualFileObject, ProcessServerConfigFunction } from 'filepond';
import { FileStatus } from 'filepond';
import 'filepond/dist/filepond.min.css';
import { useState, useRef, useCallback, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import LZString from 'lz-string';

interface UploadResult {
    id: number;
    filename: string;
}

interface PresignResponse {
    url: string;
    key: string;
}

interface CompleteResponse {
    id: number;
    filename: string;
}

const PRESIGN_URL = '/api/v1/uploads/presign';
const COMPLETE_URL = '/api/v1/uploads/complete';
const MAX_FILES = 10;

async function getPresignedUrl(file: ActualFileObject, fingerprint: string): Promise<PresignResponse> {
    const response = await fetch(PRESIGN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            fingerprint,
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get presigned URL');
    }

    return response.json();
}

async function uploadToS3(url: string, file: ActualFileObject): Promise<void> {
    const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
    });

    if (!response.ok) {
        throw new Error('Failed to upload file to S3');
    }
}

async function completeUpload(key: string): Promise<CompleteResponse> {
    const response = await fetch(COMPLETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to complete upload');
    }

    return response.json();
}

async function processFileUpload(
    file: ActualFileObject,
    fingerprint: string
): Promise<CompleteResponse> {
    const presignData = await getPresignedUrl(file, fingerprint);
    await uploadToS3(presignData.url, file);
    return completeUpload(presignData.key);
}

function compressUploadData(results: UploadResult[]): string {
    const data = { files: results.map((r) => ({ name: r.filename, id: r.id })) };
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}

const FileUpload = () => {
    const [files, setFiles] = useState<FilePondFile[]>([]);
    const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [visitorId, setVisitorId] = useState<string>('');
    const pondRef = useRef<FilePond>(null);

    useEffect(() => {
        const getFingerprint = async () => {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            setVisitorId(result.visitorId);
        };
        getFingerprint();
    }, []);

    const handleProcessFile = useCallback((error: FilePondErrorDescription | null, file: FilePondFile) => {
        if (error || !file.serverId) return;

        const result = JSON.parse(file.serverId);
        setUploadResults((prev) => [...prev, { id: result.id, filename: result.filename }]);
    }, []);

    const handleUploadAll = useCallback(async () => {
        if (!pondRef.current) return;

        setIsUploading(true);
        setUploadResults([]);

        const pond = pondRef.current;
        const filesToUpload = pond.getFiles().filter((f) => f.status === FileStatus.IDLE);

        for (const file of filesToUpload) {
            await pond.processFile(file).catch(() => {});
        }

        setIsUploading(false);
    }, []);

    const redirectToCompletePage = useCallback(() => {
        if (uploadResults.length === 0) return;

        const compressed = compressUploadData(uploadResults);
        window.location.href = `${window.location.origin}/upload_complete?data=${compressed}`;
    }, [uploadResults]);

    const serverConfig = {
        process: (async (
            _fieldName: string,
            file: ActualFileObject,
            _metadata: Record<string, string>,
            load: (p: string | { abort: () => void }) => void,
            error: (message: string) => void,
            _progress: (computable: boolean, loaded: number, total: number) => void,
            abort: () => void
        ) => {
            try {
                const result = await processFileUpload(file, visitorId);
                load(JSON.stringify(result));
            } catch (err: unknown) {
                error(err instanceof Error ? err.message : 'Upload failed');
            }

            return { abort };
        }) as ProcessServerConfigFunction,
    };

    const allFilesProcessed = files.length > 0 && files.every((f) => f.status === FileStatus.PROCESSING_COMPLETE);

    useEffect(() => {
        if (allFilesProcessed && uploadResults.length > 0) {
            redirectToCompletePage();
        }
    }, [allFilesProcessed, uploadResults, redirectToCompletePage]);

    const hasFiles = files.length > 0;

    return (
        <div className='max-w-3xl mx-auto py-5'>
            <FilePond
                ref={pondRef}
                files={files as unknown as (ActualFileObject | Blob | string)[]}
                onupdatefiles={setFiles}
                onprocessfile={handleProcessFile}
                allowMultiple={true}
                maxFiles={MAX_FILES}
                server={serverConfig}
                credits={false}
                instantUpload={false}
                allowRevert={false}
                labelIdle="Drag and Drop your files or <span class='filepond--label-action'>Browse</span>"
            />
            <div className='mt-4 flex gap-4'>
                <button
                    onClick={handleUploadAll}
                    disabled={isUploading || !hasFiles}
                    className='px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400'
                >
                    {isUploading ? 'Uploading...' : 'Upload'}
                </button>
            </div>
        </div>
    );
};

export default FileUpload;
