import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';


export const createToken = (
  jwtPayload: string | object | Buffer,
  secret: string,
  expiresIn:  number | string = '1h',
): string => {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return jwt.sign(jwtPayload, secret, options);
};


export const verifyToken = <T extends JwtPayload | string>(
  token: string,
  secret: string
): T => {
  return jwt.verify(token, secret) as T;
};
