import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export async function createUser(email: string, password: string, name?: string) {
  const passwordHash = await hashPassword(password)
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
    },
  })
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  })
}

export async function verifyUser(email: string, password: string) {
  const user = await getUserByEmail(email)
  if (!user) return null

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) return null

  return user
}
