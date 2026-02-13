interface HeartbeatProps {
  percentage: number
}

export default function Heartbeat({ percentage }: HeartbeatProps) {
  const totalBars = 20
  const barPercentage = 5

  const fullBars = Math.floor(percentage / barPercentage)
  const remainder = percentage % barPercentage
  const partialFill = (remainder / barPercentage) * 100

  const formatPercentage = (value: number): string => {
    const truncated = Math.trunc(value * 100) / 100
    return truncated.toFixed(2)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: totalBars }, (_, i) => {
          let barClass = 'w-2 h-6 rounded-sm bg-gray-200'

          if (i < fullBars) {
            barClass = 'w-2 h-6 rounded-sm bg-green-500'
          } else if (i === fullBars && remainder > 0) {
            return (
              <div
                key={i}
                className="w-2 h-6 rounded-sm"
                style={{
                  background: `linear-gradient(to right, #22c55e ${partialFill}%, #e5e7eb ${partialFill}%)`,
                }}
              />
            )
          }

          return <div key={i} className={barClass} />
        })}
      </div>
      <span className="text-sm font-medium text-gray-700 min-w-16">
        {formatPercentage(percentage)}%
      </span>
    </div>
  )
}
