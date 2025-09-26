export const authMiddleware = asyncHandler(
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    let token: string | undefined;

    // Check for JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Check for API key in headers
    const apiKey = req.headers['x-api-key'] as string;

    if (!token && !apiKey) {
      throw new AppError('Authentication required', 401);
    }

    try {
      let user: User | null = null;

      if (token) {
        // JWT authentication
        const decoded = TokenService.verifyAccessToken(token);
        user = await userStore.findById(decoded.id);
      } else if (apiKey) {
        // API key authentication
        user = await userStore.findByApiKey(apiKey);
      }

      if (!user) {
        throw new AppError('Invalid authentication credentials', 401);
      }

      req.user = user;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Authentication failed', 401);
    }
  }
);


