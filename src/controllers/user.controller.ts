import { Request, Response, NextFunction } from 'express'

export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.json({ message: 'Get all users' })
  } catch (err) {
    next(err)
  }
}
