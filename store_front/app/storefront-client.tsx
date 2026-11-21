'use client';

import { useEffect, useRef, useState } from 'react';

type Product = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
  variants: Array<{ id: string; size: string; price: string; stock: number }>;
};

type Message = {
  role: 'customer' | 'assistant';
  content: string;
  ts: string;
  toolData?: { name: string; result: any } | null;
};

type ApprovalState = {
  status: string;
  result: any;
  error: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
};

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Storefront({ products }: { products: Product[] }) {
  return (
    <section id="products" className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-bold text-forest-800">Shop All</h2>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {products.map(p => {
          const sizes = p.variants;
          const inStock = sizes.filter(v => v.stock > 0).length;
          return (
            <div key={p.id} className="group rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-all hover:shadow-md">
              <div className="relative mb-3 overflow-hidden rounded-xl bg-stone-100">
                {p.image ? (
                  <img src={p.image} alt={p.imageAlt} className="h-48 w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center text-stone-300">
                    <span className="text-3xl">🏔️</span>
                  </div>
                )}
                {inStock === 0 && (
                  <span className="absolute top-2 right-2 rounded-full bg-stone-800/80 px-2 py-0.5 text-[10px] font-medium text-white">Sold Out</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-stone-800">{p.title}</h3>
              <p className="text-sm font-medium text-terracotta-500">${p.variants[0]?.price}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {sizes.map(v => (
                  <span key={v.id} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${v.stock > 0 ? 'bg-forest-50 text-forest-700' : 'bg-stone-100 text-stone-400 line-through'}`}>
                    {v.size}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-warm-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-sm font-bold text-white">N</div>
            <span className="text-base font-semibold text-forest-800">Northwind Supply Co.</span>
          </div>
          <nav className="hidden gap-6 text-sm text-stone-600 sm:flex">
            <a href="#" className="hover:text-forest-700 transition-colors">Shop</a>
            <a href="#" className="hover:text-forest-700 transition-colors">About</a>
            <a href="#" className="hover:text-forest-700 transition-colors">Journal</a>
            <a href="/owner" className="hover:text-forest-700 transition-colors">Owner</a>
          </nav>
          <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:border-forest-400 transition-colors">
            Cart (0)
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-forest-800 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="max-w-xl">
            <span className="inline-block rounded-full bg-forest-600/60 px-3 py-1 text-xs font-medium text-forest-100">New Arrivals · Fall 2026</span>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">Built for the trail.<br />Designed for everyday.</h1>
            <p className="mt-4 text-base text-forest-200">Premium outdoor apparel that moves with you — from mountain ridge to morning coffee.</p>
            <div className="mt-6 flex gap-3">
              <a href="#products" className="rounded-xl bg-terracotta-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-terracotta-600 transition-colors">Shop the collection</a>
              <a href="#" className="rounded-xl border border-forest-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-700 transition-colors">Read our story</a>
            </div>
          </div>
        </div>
      </section>

      {/* Content (product grid via Suspense) */}
      {children}

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-warm-white">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-stone-500">
          Northwind Supply Co. — Premium outdoor apparel. © 2026
        </div>
      </footer>

      {/* Floating Chat Widget */}
      <div className="fixed bottom-5 right-5 z-50">
        {chatOpen ? (
          <div className="slide-up w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px]">
            <ChatPanel onClose={() => setChatOpen(false)} />
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-2 rounded-full bg-forest-700 px-5 py-3 text-sm font-semibold text-white shadow-xl hover:bg-forest-800 transition-all hover:scale-105"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            Chat with us
          </button>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I can help track your order, start a return, or find the right size. What do you need?", ts: now(), toolData: null },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [approvalRef, setApprovalRef] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<ApprovalState | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!approvalRef) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/approval-status?reference=${approvalRef}`);
        if (res.ok) setApprovalState(await res.json());
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [approvalRef]);

  async function send(text: string) {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: 'customer', content: text, ts: now(), toolData: null }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: text }),
      });
      const data = await res.json();
      if (data.conversation_id) setConversationId(data.conversation_id);
      if (data.approval_reference) {
        setApprovalRef(data.approval_reference);
        setApprovalState(null);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply ?? 'Sorry, something went wrong.',
        ts: now(),
        toolData: data.tool_data ?? null,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.', ts: now(), toolData: null }]);
    }
    setLoading(false);
  }

  function renderCard(msg: Message) {
    if (!msg.toolData?.result) return null;
    const { name, result } = msg.toolData;

    if (name === 'lookup_order' && result.found) {
      const steps = ['Ordered', 'Shipped', 'Delivered'];
      const fs = (result.fulfillmentStatus || '').toUpperCase();
      const currentStep = fs === 'FULFILLED' ? 2 : fs === 'PARTIALLY_FULFILLED' ? 1 : 0;
      const track = result.fulfillments?.[0];
      return (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 text-[13px] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-forest-700">{result.name}</span>
            <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-600">
              {result.financialStatus?.toLowerCase()}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {result.items.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                {item.image ? (
                  <img src={item.image} alt={item.title} className="h-9 w-9 rounded-md object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-md bg-stone-100" />
                )}
                <div className="flex-1">
                  <div className="text-[12px] font-medium text-stone-800">{item.title}</div>
                  <div className="text-[11px] text-stone-500">{item.variant} · Qty {item.quantity}</div>
                </div>
                <div className="text-[11px] text-stone-500">{item.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            {steps.map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex flex-col items-center`}>
                  <div className={`h-4 w-4 rounded-full border-2 ${i <= currentStep ? 'border-forest-600 bg-forest-600' : 'border-stone-300 bg-white'}`} />
                  <span className={`mt-1 text-[10px] ${i <= currentStep ? 'text-forest-700 font-medium' : 'text-stone-400'}`}>{step}</span>
                </div>
                {i < steps.length - 1 && <div className={`mx-1 h-0.5 w-6 ${i < currentStep ? 'bg-forest-600' : 'bg-stone-200'}`} />}
              </div>
            ))}
          </div>
          {track?.tracking && (
            <a href="#" className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-terracotta-500 hover:text-terracotta-600">
              {track.carrier}: {track.tracking} ↗
            </a>
          )}
        </div>
      );
    }

    if (name === 'size_help' && result.found) {
      const sizes = result.variants || [];
      return (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 text-[13px] shadow-sm">
          <div className="flex items-center gap-2">
            {result.image && <img src={result.image} alt={result.product} className="h-10 w-10 rounded-md object-cover" />}
            <span className="font-semibold text-forest-700">{result.product}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sizes.map((v: any) => (
              <span key={v.size} className={`rounded-lg px-2 py-1 text-[11px] font-medium ${v.size === result.recommendation ? 'bg-forest-600 text-white' : (v.stock > 0 ? 'bg-forest-50 text-forest-700' : 'bg-stone-100 text-stone-400 line-through')}`}>
                {v.size}{v.stock > 0 ? '' : ' · OOS'}
              </span>
            ))}
          </div>
          {result.recommendation && (
            <div className="mt-2 rounded-lg bg-terracotta-500/10 px-2 py-1.5 text-[12px] text-terracotta-600">
              ✓ Recommended size: <strong>{result.recommendation}</strong>
            </div>
          )}
        </div>
      );
    }

    if ((name === 'request_refund' || name === 'propose_discount') && approvalRef) {
      const isRefund = name === 'request_refund';
      const st = approvalState?.status || 'pending';
      return (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 text-[13px] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-forest-700">{isRefund ? 'Refund Request' : 'Discount Request'}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st === 'approved' ? 'bg-green-100 text-green-700' : st === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700 pulse-amber'}`}>
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </span>
          </div>
          <div className="mt-1.5 text-[12px] text-stone-600">
            {isRefund
              ? `${st === 'approved' ? 'Refunded' : 'Refund amount'}: ${Number(approvalState?.result?.amount ?? result.amount ?? 0).toFixed(2)} ${approvalState?.result?.currency ?? result.currency ?? ''}`
              : `Discount: ${result.percent || ''}%`}
          </div>
          {st === 'approved' && approvalState?.result?.code && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-2 py-1.5">
              <span className="text-[12px] font-mono font-semibold text-green-700">{approvalState.result.code}</span>
              <button
                onClick={() => navigator.clipboard.writeText(approvalState.result.code)}
                className="rounded-md bg-green-600 px-2 py-0.5 text-[11px] text-white hover:bg-green-700"
              >
                Copy
              </button>
            </div>
          )}
          {st === 'rejected' && approvalState?.decisionNote && (
            <div className="mt-1.5 text-[12px] text-red-600">{approvalState.decisionNote}</div>
          )}
          {st === 'failed' && approvalState?.error && (
            <div className="mt-1.5 text-[12px] text-red-600">Error: {approvalState.error}</div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 bg-forest-700 px-4 py-3 text-white">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-forest-600 text-sm font-bold">
          N
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-forest-700 bg-green-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Northwind Support</div>
          <div className="text-[11px] text-forest-200">Typically replies instantly</div>
        </div>
        <button onClick={onClose} className="text-forest-200 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-cream px-4 py-3">
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${m.role === 'customer' ? '' : 'w-full'}`}>
              <div className={`rounded-2xl px-3.5 py-2 text-[13px] ${m.role === 'customer' ? 'bg-forest-600 text-white' : 'bg-white text-stone-800 shadow-sm'}`}>
                {m.content}
              </div>
              {m.role === 'assistant' && renderCard(m)}
              <div className={`mt-0.5 text-[10px] text-stone-400 ${m.role === 'customer' ? 'text-right' : ''}`}>{m.ts}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="flex flex-wrap gap-1.5 border-t border-stone-100 bg-white px-3 py-2">
        {["Where's my order?", 'Start a return', 'Size help'].map(chip => (
          <button key={chip} onClick={() => send(chip)} className="rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-medium text-forest-700 hover:bg-forest-100 transition-colors">
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-stone-100 bg-white p-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 rounded-xl border border-stone-200 bg-cream px-3 py-2 text-[13px] outline-none focus:border-forest-400 transition-colors"
          placeholder="Type your message…"
        />
        <button type="submit" disabled={loading} className="rounded-xl bg-forest-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors">
          Send
        </button>
      </form>
    </div>
  );
}
