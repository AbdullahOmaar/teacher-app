import { Star } from 'lucide-react'

/** نجوم تقييم للعرض فقط — المملوء منها بعدد النجوم */
export function StarsRow({ stars, size = 16 }: { stars: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${stars}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= stars ? 'text-warn fill-warn' : 'text-border'}
        />
      ))}
    </span>
  )
}

/** منتقي نجوم تفاعلي لبطاقة التقييم في البوابات */
export function StarsPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (stars: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="p-1 cursor-pointer bg-transparent border-0"
          aria-label={`${i}/5`}
        >
          <Star
            size={30}
            className={i <= value ? 'text-warn fill-warn' : 'text-border'}
          />
        </button>
      ))}
    </div>
  )
}
