'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { OrderWithItems, OrderStatus } from '@/types/cafe';
import { formatCents } from '@/lib/utils';
import QRCode from 'qrcode';

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<OrderStatusSkeleton />}>
      <OrderStatusInner />
    </Suspense>
  );
}

function OrderStatusSkeleton() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-muted">Loading order…</p>
    </main>
  );
}

function OrderStatusInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const paid = searchParams.get('paid') === '1';
  const [order, setOrder] = useState<(OrderWithItems & { status: OrderStatus }) | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const res = await fetch(`/api/order/${id}/status`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order as (OrderWithItems & { status: OrderStatus }));
      }
    };
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (order?.stripe_url) {
      QRCode.toDataURL(order.stripe_url, { width: 160, margin: 2 }).then(setQrDataUrl);
    }
  }, [order?.stripe_url]);

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted">Loading order…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-8 text-foreground">
      <h1 className="font-serif text-2xl font-semibold">Ember & Oat</h1>
      <p className="mt-1 text-muted">{order.order_number}</p>

      <div className="mt-8 w-full max-w-md space-y-4">
        <AnimatePresence mode="wait">
          {(order.status as OrderStatus) === 'ready' || (order.status as OrderStatus) === 'paid' ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-sage/30 bg-sage/10 p-8 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage/20">
                <svg className="h-8 w-8 text-sage" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="mt-4 text-xl font-medium text-sage">Your order is ready!</p>
            </motion.div>
          ) : (
            <motion.div
              key="pay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm"
            >
              <p className="text-lg font-medium">Pay {formatCents(order.total_amount)}</p>
              {paid && (order.status as OrderStatus) !== 'paid' && (order.status as OrderStatus) !== 'ready' && (
                <p className="mt-2 text-sm text-muted">Finalizing payment…</p>
              )}
              {((order.status as OrderStatus) === 'paid') && (
                <p className="mt-2 text-sm text-sage">Paid (test)</p>
              )}
              {qrDataUrl && (order.status as OrderStatus) !== 'ready' && (
                <div className="mt-4 flex justify-center">
                  <img src={qrDataUrl} alt="Payment QR code" className="h-40 w-40 rounded-lg border border-border" />
                </div>
              )}
              {order.stripe_url && (order.status as OrderStatus) !== 'ready' && (
                <a
                  href={order.stripe_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block w-full rounded-xl bg-[#635BFF] py-3 text-sm font-medium text-white hover:bg-[#4f49cc]"
                >
                  {(order.status as OrderStatus) === 'paid' ? 'View receipt (test)' : `Pay ${formatCents(order.total_amount)} (test)`}
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

