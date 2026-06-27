export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const minsStr = mins.toString().padStart(2, '0');
  const secsStr = secs.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(2, '0');

  if (hrs > 0) {
    const hrsStr = hrs.toString().padStart(2, '0');
    return `${hrsStr}:${minsStr}:${secsStr}.${msStr}`;
  }

  return `${minsStr}:${secsStr}.${msStr}`;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(0)}s`;
}
