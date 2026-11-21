'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface Forecast {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  rate: number;
  days_of_cover: number;
  run_out_date: string | null;
  reorder_point: number;
  status: string;
  lead_time_days: number;
  on_order: number;
}

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function HeroChart({ forecast, today: todayStr }: { forecast: Forecast; today: string }) {
  const data = useMemo(() => {
    const today = new Date(todayStr);
    today.setHours(0, 0, 0, 0);
    const dayMs = 86_400_000;
    const points: Array<{ date: string; label: string; stock: number | null; projected: number | null; reorder: number }> = [];

    const rate = forecast.rate;
    const onHand = forecast.on_hand;
    const reorderPt = forecast.reorder_point;

    // Past 60 days of stock (reconstructed: onHand + rate * days_ago)
    for (let i = 60; i >= 1; i--) {
      const d = new Date(today.getTime() - i * dayMs);
      const stock = Math.round(onHand + rate * i);
      points.push({
        date: d.toISOString().slice(0, 10),
        label: dateStr(d),
        stock,
        projected: null,
        reorder: Math.round(reorderPt),
      });
    }

    // Today
    points.push({
      date: today.toISOString().slice(0, 10),
      label: dateStr(today),
      stock: onHand,
      projected: onHand,
      reorder: Math.round(reorderPt),
    });

    // Projection forward to run-out (or 30 days)
    if (rate > 0) {
      const daysToZero = Math.ceil(onHand / rate);
      const projDays = Math.min(Math.max(daysToZero + 5, 14), 45);
      for (let i = 1; i <= projDays; i++) {
        const d = new Date(today.getTime() + i * dayMs);
        const projected = Math.max(0, Math.round(onHand - rate * i));
        points.push({
          date: d.toISOString().slice(0, 10),
          label: dateStr(d),
          stock: null,
          projected,
          reorder: Math.round(reorderPt),
        });
      }
    }

    return points;
  }, [forecast, todayStr]);

  const runOutDate = forecast.run_out_date ? new Date(forecast.run_out_date) : null;
  const leadEnd = useMemo(() => {
    const today = new Date(todayStr);
    return new Date(today.getTime() + forecast.lead_time_days * 86_400_000);
  }, [todayStr, forecast.lead_time_days]);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="leadBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FDE68A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FDE68A" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            interval={Math.floor(data.length / 8)}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              fontSize: 12,
              boxShadow: '0 8px 24px -12px rgb(0 0 0/.08)',
            }}
            labelStyle={{ color: '#4B5563', fontWeight: 600 }}
          />

          {/* Lead-time band */}
          <ReferenceLine
            x={new Date(todayStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            stroke="#9CA3AF"
            strokeDasharray="2 2"
            label={{ value: 'Today', fontSize: 9, fill: '#9CA3AF', position: 'top' }}
          />
          <ReferenceLine
            x={leadEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            stroke="#B45309"
            strokeDasharray="3 3"
            label={{ value: 'Lead time', fontSize: 9, fill: '#B45309', position: 'top' }}
          />

          {/* Reorder point line */}
          <ReferenceLine
            y={Math.round(forecast.reorder_point)}
            stroke="#B45309"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: 'Reorder point', fontSize: 9, fill: '#B45309', position: 'right' }}
          />

          {/* Run-out marker */}
          {runOutDate && (
            <ReferenceLine
              x={runOutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              stroke="#B91C1C"
              strokeWidth={1.5}
              label={{ value: `Runs out ${dateStr(runOutDate)}`, fontSize: 10, fill: '#B91C1C', position: 'top' }}
            />
          )}

          {/* Stock line (past, solid) */}
          <Line
            type="monotone"
            dataKey="stock"
            stroke="#1E3A8A"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            name="Stock on hand"
          />

          {/* Projected line (dashed) */}
          <Line
            type="monotone"
            dataKey="projected"
            stroke="#1E3A8A"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeOpacity={0.6}
            dot={false}
            connectNulls
            name="Projected"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
