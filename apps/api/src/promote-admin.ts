import { database, transaction } from './db';
import { audit } from './wallet';
const email = process.argv[2];
if (!email) throw new Error('Usage: promote-admin.ts verified-email');
const { pool } = database(process.env.DATABASE_URL!);
try {
  await transaction(pool, async (tx) => {
    const user = await tx.query<{ id: string }>(
      "UPDATE users SET role='superadmin' WHERE email=lower($1) AND email_verified=true RETURNING id",
      [email],
    );
    if (!user.rowCount) throw new Error('Verified user not found');
    await audit(tx, user.rows[0]!.id, 'LOCAL_ADMIN_BOOTSTRAP', user.rows[0]!.id);
  });
  console.log('Admin promoted. MFA setup and verification still required.');
} finally {
  await pool.end();
}
