import { NextResponse } from 'next/server';
import { runAnalysis } from '@/vector-db/analyze_risk';
import { getDb } from '@/app/lib/db';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const contractId = Number(id);

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json(
        { error: 'Invalid contract ID' },
        { status: 400 }
      );
    }

    console.log(`Starting analysis for contract ${contractId}...`);

    // Run the actual AI/risk analysis
    const result = await runAnalysis(contractId);

    // Update contract status after successful analysis
    const db = getDb();

    await db.execute(
      `UPDATE contracts
       SET status = 'analyzed'
       WHERE contract_id = ?`,
      [contractId]
    );

    console.log(`Contract ${contractId} status updated to analyzed.`);

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      status: 'analyzed',
      result
    });

  } catch (error) {
    console.error('Analysis error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}