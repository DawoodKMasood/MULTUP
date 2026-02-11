import { FilePond, registerPlugin } from 'react-filepond';
import type { FilePondFile, FilePondErrorDescription, ActualFileObject, ProcessServerConfigFunction } from 'filepond';
import { FileStatus } from 'filepond';
import 'filepond/dist/filepond.min.css';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import { useState, useRef, useCallback, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import LZString from 'lz-string';
import { jsonFetch } from '~/utils/http';

registerPlugin(FilePondPluginFileValidateType);

const ACCEPTED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/octet-stream',
];

const FILE_TYPE_LABELS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
    'application/json': '.json',
    'application/octet-stream': '.bin',
};

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
    return jsonFetch(PRESIGN_URL, {
        method: 'POST',
        body: JSON.stringify({
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            fingerprint,
        }),
    });
}

async function uploadToS3(
    url: string,
    file: ActualFileObject,
    onProgress: (loaded: number, total: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                onProgress(event.loaded, event.total);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error('Failed to upload file to S3'));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Upload aborted'));
        });

        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
    });
}

async function completeUpload(key: string): Promise<CompleteResponse> {
    return jsonFetch(COMPLETE_URL, {
        method: 'POST',
        body: JSON.stringify({ key }),
    });
}

async function processFileUpload(
    file: ActualFileObject,
    fingerprint: string,
    onProgress: (loaded: number, total: number) => void
): Promise<CompleteResponse> {
    const presignData = await getPresignedUrl(file, fingerprint);
    await uploadToS3(presignData.url, file, onProgress);
    return completeUpload(presignData.key);
}

function compressUploadData(results: UploadResult[]): string {
    const data = { files: results.map((r) => ({ name: r.filename, id: r.id })) };
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}

const FileUpload = () => {
    const [files, setFiles] = useState<FilePondFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [visitorId, setVisitorId] = useState<string>('');
    const pondRef = useRef<FilePond>(null);
    const uploadResultsRef = useRef<UploadResult[]>([]);
    const processedCountRef = useRef<number>(0);
    const totalFilesRef = useRef<number>(0);

    useEffect(() => {
        const getFingerprint = async () => {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            setVisitorId(result.visitorId);
        };
        getFingerprint();
    }, []);

    const checkAllComplete = useCallback(() => {
        if (processedCountRef.current === totalFilesRef.current && totalFilesRef.current > 0) {
            if (uploadResultsRef.current.length > 0) {
                const compressed = compressUploadData(uploadResultsRef.current);
                window.location.href = `${window.location.origin}/upload_complete?data=${compressed}`;
            }
        }
    }, []);

    const handleProcessFile = useCallback((error: FilePondErrorDescription | null, file: FilePondFile) => {
        processedCountRef.current++;

        if (!error && file.serverId) {
            const result = JSON.parse(file.serverId);
            uploadResultsRef.current.push({ id: result.id, filename: result.filename });
        }

        checkAllComplete();
    }, [checkAllComplete]);

    const handleUploadAll = useCallback(async () => {
        if (!pondRef.current) return;

        setIsUploading(true);
        uploadResultsRef.current = [];
        processedCountRef.current = 0;

        const pond = pondRef.current;
        const filesToUpload = pond.getFiles().filter((f) => f.status === FileStatus.IDLE);
        totalFilesRef.current = filesToUpload.length;

        await Promise.all(filesToUpload.map((file) => pond.processFile(file)));

        setIsUploading(false);
    }, []);

    const serverConfig = {
        process: (async (
            _fieldName: string,
            file: ActualFileObject,
            _metadata: Record<string, string>,
            load: (p: string | { abort: () => void }) => void,
            error: (message: string) => void,
            progress: (computable: boolean, loaded: number, total: number) => void,
            abort: () => void
        ) => {
            try {
                const result = await processFileUpload(file, visitorId, (loaded, total) => {
                    progress(true, loaded, total);
                });
                load(JSON.stringify(result));
            } catch (err: unknown) {
                error(err instanceof Error ? err.message : 'Upload failed');
            }

            return { abort };
        }) as ProcessServerConfigFunction,
    };

    const hasFiles = files.length > 0;

    return (
        <div className='max-w-6xl mx-auto py-4 px-4'>
            <FilePond
                maxParallelUploads={5}
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
                fileValidateTypeLabelExpectedTypes="File is of invalid type"
                labelFileTypeNotAllowed="Invalid file extension"
                labelIdle="Drag and Drop your files or <span class='filepond--label-action'>Browse</span>"
                acceptedFileTypes={ACCEPTED_MIME_TYPES}
                fileValidateTypeLabelExpectedTypesMap={FILE_TYPE_LABELS}
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
