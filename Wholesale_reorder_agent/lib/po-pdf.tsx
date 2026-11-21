import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { PurchaseOrder, PoLine } from './db';
import type { Supplier } from './forecast';

// Register Inter (use Helvetica fallback bundled with react-pdf)
// We rely on default fonts to keep the bundle simple and avoid network fetches.

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    padding: 40,
    paddingTop: 0,
  },
  headerRule: {
    height: 3,
    backgroundColor: '#1E3A8A',
    marginBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  company: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1E3A8A',
  },
  companySub: {
    fontSize: 9,
    color: '#4B5563',
    marginTop: 2,
  },
  poBlock: {
    textAlign: 'right',
  },
  poTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  poDates: {
    fontSize: 9,
    color: '#4B5563',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 8,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  supplierBlock: {
    marginBottom: 24,
  },
  supplierName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  supplierLine: {
    fontSize: 9,
    color: '#4B5563',
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#4B5563',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableRowText: {
    fontSize: 9,
  },
  colSku: { width: '18%', fontFamily: 'Helvetica' },
  colItem: { width: '34%' },
  colSize: { width: '10%' },
  colQty: { width: '10%', textAlign: 'right' },
  colCost: { width: '14%', textAlign: 'right' },
  colTotal: { width: '14%', textAlign: 'right' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  totalsCol: {
    width: 200,
  },
  totalsLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    fontSize: 10,
  },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#1E3A8A',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  terms: {
    marginTop: 32,
    fontSize: 8,
    color: '#9CA3AF',
    lineHeight: 1.5,
  },
  signature: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sigLine: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: '#9CA3AF',
    paddingTop: 4,
    fontSize: 8,
    color: '#9CA3AF',
  },
  watermark: {
    position: 'absolute',
    top: 300,
    left: 60,
    right: 60,
    textAlign: 'center',
    fontSize: 60,
    fontFamily: 'Helvetica-Bold',
    color: 'rgba(180, 83, 9, 0.15)',
    transform: 'rotate(-25deg)',
  },
  approvalStamp: {
    marginTop: 12,
    fontSize: 9,
    color: '#1E3A8A',
    fontFamily: 'Helvetica-Bold',
  },
  whyNote: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#EFF4FF',
    borderRadius: 6,
    fontSize: 9,
    color: '#1E3A8A',
    lineHeight: 1.5,
  },
});

export interface PoPdfProps {
  po: PurchaseOrder;
  supplier: Supplier & { email: string; address?: string | null };
  lines: PoLine[];
  issueDate: string;
  requiredBy: string;
  currency: string;
  whyNote?: string | null;
}

function money(n: number, currency: string) {
  const sym = currency === 'USD' ? '$' : `${currency} `;
  return `${sym}${Number(n).toFixed(2)}`;
}

export function PurchaseOrderPdf({
  po,
  supplier,
  lines,
  issueDate,
  requiredBy,
  currency,
  whyNote,
}: PoPdfProps) {
  const isDraft = po.status === 'draft';
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRule} />
        <View style={styles.topRow}>
          <View>
            <Text style={styles.company}>Northwind Supply Co.</Text>
            <Text style={styles.companySub}>Wholesale Reorder · Shopify dev store</Text>
          </View>
          <View style={styles.poBlock}>
            <Text style={styles.poTitle}>PURCHASE ORDER</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 4 }}>
              {po.po_number}
            </Text>
            <Text style={styles.poDates}>Issued: {issueDate}</Text>
            <Text style={styles.poDates}>Required by: {requiredBy}</Text>
          </View>
        </View>

        <View style={styles.supplierBlock}>
          <Text style={styles.sectionLabel}>Supplier</Text>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <Text style={styles.supplierLine}>{supplier.email}</Text>
          {supplier.address ? (
            <Text style={styles.supplierLine}>{supplier.address}</Text>
          ) : null}
          <Text style={styles.supplierLine}>
            Lead time: {supplier.lead_time_days} days · MOQ: {supplier.moq} · Case pack: {supplier.case_pack}
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colSku]}>SKU</Text>
          <Text style={[styles.tableHeaderText, styles.colItem]}>Item</Text>
          <Text style={[styles.tableHeaderText, styles.colSize]}>Size</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.colCost]}>Unit Cost</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
        </View>

        {lines.map((l, i) => (
          <View key={i} style={styles.tableRow} break={i > 0 && i % 20 === 0}>
            <Text style={[styles.tableRowText, styles.colSku]}>{l.supplier_sku ?? '—'}</Text>
            <Text style={[styles.tableRowText, styles.colItem]}>{l.item_name}</Text>
            <Text style={[styles.tableRowText, styles.colSize]}>{l.size}</Text>
            <Text style={[styles.tableRowText, styles.colQty]}>{l.qty}</Text>
            <Text style={[styles.tableRowText, styles.colCost]}>{money(l.unit_cost, currency)}</Text>
            <Text style={[styles.tableRowText, styles.colTotal]}>{money(l.line_total, currency)}</Text>
          </View>
        ))}

        {whyNote ? (
          <View style={styles.whyNote}>
            <Text>{whyNote}</Text>
          </View>
        ) : null}

        <View style={styles.totalsRow}>
          <View style={styles.totalsCol}>
            <View style={styles.totalsLine}>
              <Text>Units</Text>
              <Text>{po.total_units}</Text>
            </View>
            <View style={styles.totalsLine}>
              <Text>Subtotal</Text>
              <Text>{money(po.subtotal, currency)}</Text>
            </View>
            <View style={styles.totalsLine}>
              <Text>Tax</Text>
              <Text>{money(po.tax_total, currency)}</Text>
            </View>
            <View style={styles.totalsGrand}>
              <Text>Total</Text>
              <Text>{money(po.total, currency)}</Text>
            </View>
          </View>
        </View>

        {po.status === 'approved' && po.approved_by ? (
          <Text style={styles.approvalStamp}>
            Approved by {po.approved_by} on{' '}
            {po.approved_at
              ? new Date(po.approved_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
              : ''}
          </Text>
        ) : null}

        <Text style={styles.terms}>
          Terms: Net 30. Sample data for demonstration only — no real order is placed and nothing is emailed.
          This purchase order was drafted by the Wholesale Reorder Agent from Shopify stock levels and seeded sales history.
        </Text>

        <View style={styles.signature}>
          <View style={styles.sigLine}>
            <Text>Authorized signature</Text>
          </View>
          <View style={styles.sigLine}>
            <Text>Date</Text>
          </View>
        </View>

        {isDraft ? <Text style={styles.watermark}>DRAFT</Text> : null}
      </Page>
    </Document>
  );
}
