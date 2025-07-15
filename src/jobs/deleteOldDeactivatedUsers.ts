import { User } from '../models/user.model'

export const deleteOldDeactivatedUsers = async () => {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const now = new Date()

  const result = await User.deleteMany({
    deactivate: true,
    dateOfdeactivate: { $lte: new Date(now.getTime() - THIRTY_DAYS) },
  })

  console.log(`${result.deletedCount} deactivated users deleted`)
}
