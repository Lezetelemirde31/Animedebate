-- Profile pictures uploaded from the device (stored re-encoded, max a few dozen KB).
CREATE TABLE "UserAvatarImage" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatarImage_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserAvatarImage" ADD CONSTRAINT "UserAvatarImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
