interface HeartbeatProps {
  percentage: number
}

export default function Heartbeat({ percentage }: HeartbeatProps) {
  const greenBars = Math.round(percentage / 5)
  const totalBars = 20

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: totalBars }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-6 rounded-sm ${
              i < greenBars ? 'bg-green-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-gray-700 min-w-12">{percentage}%</span>
    </div>
  )
}
