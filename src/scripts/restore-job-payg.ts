import 'dotenv/config'
import mongoose from 'mongoose'
import { restoreJobPaygCatalog } from '../services/jobPaygCatalog.service'

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false })
  const apply = process.argv.includes('--apply')
  console.log(JSON.stringify(await restoreJobPaygCatalog(apply), null, 2))
  console.log(apply ? 'PAYG catalogue updated. Purchase records were not changed.' : 'Preview only. Pass --apply to restore PAYG availability.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
