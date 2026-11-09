export function toPublicUser(user) {
  if (!user) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || null,
    isEmailVerified: Boolean(user.isEmailVerified),
    providers: [
      ...((user.passwordEnabled || user.passwordHash) ? ["password"] : []),
      ...(user.googleId ? ["google"] : []),
      ...(user.githubId ? ["github"] : [])
    ],
    createdAt: user.createdAt
  };
}
