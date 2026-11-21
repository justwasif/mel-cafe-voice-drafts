'use client';

import { motion, AnimatePresence } from 'motion/react';
import { OrderWithItems } from '@/types/cafe';
import { formatCents } from '@/lib/utils';
import { X } from 'lucide-react';

interface OrderTicketProps {
  order: OrderWithItems;
  onRemoveItem?: (lineId: string) => void;
  compact?: boolean;
}

export function OrderTicket({ order, onRemoveItem, compact = false }: OrderTicketProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4 shadow-sm', compact ? 'text-sm' : 'text-base')}>
      <div className="flex items-center justify-between">
        <p className="font-serif text-lg font-semibold text-foreground">{order.order_number}</p>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">{order.status.replace(/_/g, ' ')}</span>
      </div>

      <AnimatePresence initial={false}>
        {order.items.length === 0 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-muted">
            Your order is empty.
          </motion.p>
        )}
        {order.items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            className={cn(
              'mt-3 flex items-start justify-between border-b border-border pb-3 last:border-0 last:pb-0',
              item.unavailable && 'opacity-50'
            )}
          >
            <div>
              <p className={cn('font-medium text-foreground', item.unavailable && 'line-through')}>
                {item.qty}× {item.name} <span className="text-muted">({item.size})</span>
              </p>
              {item.options.length > 0 && (
                <p className="text-xs text-muted">{item.options.map((o) => o.name).join(', ')}</p>
              )}
              {item.unavailable && <p className="text-xs font-medium text-red-500">Unavailable</p>}
            </div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{formatCents(item.line_total)}</p>
              {onRemoveItem && !item.unavailable && (
                <button onClick={() => onRemoveItem(item.id)} className="rounded-full p-1 hover:bg-accent-soft">
                  <X className="h-3.5 w-3.5 text-muted" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <p className="text-muted">Total</p>
        <motion.p
          key={order.total_amount}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className="font-serif text-xl font-semibold text-foreground"
        >
          {formatCents(order.total_amount)}
        </motion.p>
      </div>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

