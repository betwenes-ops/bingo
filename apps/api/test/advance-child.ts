import { database } from '../src/db';
import { advanceRound } from '../src/rooms';
const { pool } = database(process.env.DATABASE_URL!);
const id = process.argv[2]!;
for (;;) {
  await pool.query(
    "UPDATE game_rounds SET next_ball_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [id],
  );
  await advanceRound(pool, process.env.SEED_ENCRYPTION_KEY!, id);
  console.log('COMMITTED');
  await new Promise((resolve) => setTimeout(resolve, 500));
}
