import { NextResponse } from 'next/server';
import { runAnalysis } from '@/vector-db/analyze_risk';

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

    const result = await runAnalysis(contractId);

    return NextResponse.json({
      success: true,
      contract_id: contractId,
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