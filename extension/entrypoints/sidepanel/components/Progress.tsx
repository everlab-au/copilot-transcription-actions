export default function Progress({
  text,
  percentage,
}: {
  text: string;
  percentage: number;
}) {
  percentage = percentage ?? 0;
  return (
    <div className="mt-0.5 w-full relative text-sm text-white background-bg-cyan-400 bg-gray-200 border-1 border-gray-400 rounded-lg text-left overflow-hidden">
      <div
        className="top-0 h-full bg-blue-500 whitespace-nowrap px-2 flex items-center justify-center"
        style={{ width: `${percentage}%` }}
      >
        {`${percentage.toFixed(2)}%`}
      </div>
    </div>
  );
}
