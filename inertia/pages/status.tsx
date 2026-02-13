import { Head } from '@inertiajs/react'
import Heartbeat from '@/components/Heartbeat'

interface MirrorStatus {
  id: string
  name: string
  status24h: number
  status1h: number
}

interface StatusPageProps {
  mirrors: MirrorStatus[]
  cachedAt: string
}

function formatCachedTime(isoString: string): string {
  if (!isoString) return 'N/A'
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export default function Status({ mirrors, cachedAt }: StatusPageProps) {
  return (
    <>
      <Head title="Mirror Status" />
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="bg-white rounded-lg border border-zinc-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-300">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Mirror Status</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Real-time status of all upload mirrors based on success rates
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Last updated</p>
                <p className="text-sm text-gray-600">{formatCachedTime(cachedAt)}</p>
              </div>
            </div>
          </div>

          {mirrors.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No mirrors configured</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mirror Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status (Last 24 Hours)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status (Last 1 Hour)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mirrors.map((mirror) => (
                    <tr key={mirror.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {mirror.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Heartbeat percentage={mirror.status24h} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Heartbeat percentage={mirror.status1h} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">About Status</h3>
          <p className="text-xs text-gray-500">
            Here you can find the success rate of file uploads to various hosts in the past 12 hours and past 1 hour. If a particular host is showing low success rate, it may be having temporary issues on its end and we recommend you to avoid using it until the issue is fixed. You may also try uploading a file directly to that host and see if it is having any upload issues. If a host is failing consistently, please let us know by by contacting us.
          </p>
        </div>
      </div>
    </>
  )
}
