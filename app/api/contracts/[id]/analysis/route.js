import { getSessionUser, hasRole } from '@/app/lib/auth';
import { NextResponse } from 'next/server';
import { runAnalysis } from '@/vector-db/analyze_risk';
import { embedRiskPatterns } from '@/vector-db/embed_patterns';
import { getDb } from '@/app/lib/db';

export async function POST(request, { params }) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!hasRole(user, ['admin'])) {
    return NextResponse.json({ error: 'Admin role required to run contract analysis.' }, { status: 403 });
  }

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

    const db = getDb();
    const patternsEmbedded = await embedRiskPatterns(db);
    const result = await runAnalysis(contractId);

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
      patterns_embedded: patternsEmbedded,
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