import { useEffect, useState } from 'react';
import LZString from 'lz-string';

interface UploadResult {
  id: number;
  filename: string;
}

interface UploadData {
  files: Array<{ name: string; id: number }>;
}

const UploadResults = () => {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const compressedData = urlParams.get('data');

      if (!compressedData) {
        setError('No upload data found in URL');
        setIsLoading(false);
        return;
      }

      const decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
      if (!decompressed) {
        setError('Failed to decompress upload data');
        setIsLoading(false);
        return;
      }

      let parsed: UploadData;
      try {
        parsed = JSON.parse(decompressed);
      } catch {
        setError('Invalid upload data format: malformed JSON');
        setIsLoading(false);
        return;
      }

      if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
        setError('Invalid upload data format: no files found');
        setIsLoading(false);
        return;
      }

      const uploadResults: UploadResult[] = parsed.files.map((file) => ({
        id: file.id,
        filename: file.name,
      }));

      setResults(uploadResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while processing upload data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDownloadUrl = (id: number): string => {
    return `${window.location.origin}/download/${id}`;
  };

  const copyToClipboard = async (url: string, id: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 3000);
    } catch {
      // Silently fail if clipboard is not available
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-4 px-4">
        <div className="bg-white border rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-600">Loading upload results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-4 px-4">
        <div className="bg-white border border-red-200 rounded-lg shadow-sm p-8">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-4 px-4">
        <div className="bg-white border rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-600">No files uploaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-4 px-4">
      <div className="bg-white">
        <p className="text-gray-600 mb-6">
          Your files have been uploaded successfully. Use the links below to download them.
        </p>
        <div className="space-y-4">
          {results.map((result) => {
            const downloadUrl = getDownloadUrl(result.id);
            return (
              <div
                key={result.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm font-medium text-gray-900 truncate">{result.filename}</p>
                  <p className="text-xs text-gray-500 truncate mt-1">{downloadUrl}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(downloadUrl, result.id)}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                  >
                    {copiedId === result.id ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={downloadUrl}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UploadResults;
