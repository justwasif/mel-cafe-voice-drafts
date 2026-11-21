'use client';

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    'Order now': { bg: 'bg-[#FEF2F2]', text: 'text-[#B91C1C]', label: 'Order now' },
    'Watch': { bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', label: 'Watch' },
    'OK': { bg: 'bg-[#F0FDF4]', text: 'text-[#15803D]', label: 'OK' },
    'No sales': { bg: 'bg-[#F3F4F6]', text: 'text-[#9CA3AF]', label: 'No sales' },
    'draft': { bg: 'bg-[#F3F4F6]', text: 'text-[#4B5563]', label: 'Draft' },
    'approved': { bg: 'bg-[#EFF4FF]', text: 'text-[#1E3A8A]', label: 'Approved' },
    'rejected': { bg: 'bg-[#FEF2F2]', text: 'text-[#B91C1C]', label: 'Rejected' },
  };
  const s = map[status] ?? map['No sales'];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
