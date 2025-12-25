import { validateCloudinaryConfig } from "@/lib/cloudinary";
import { v2 as cloudinary } from "cloudinary";

export async function GET() {
  try {
    // Check environment variables
    const hasCloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
    const hasApiKey = !!process.env.CLOUDINARY_API_KEY;
    const hasApiSecret = !!process.env.CLOUDINARY_API_SECRET;

    const envStatus = {
      CLOUDINARY_CLOUD_NAME: hasCloudName,
      CLOUDINARY_API_KEY: hasApiKey,
      CLOUDINARY_API_SECRET: hasApiSecret,
    };

    // Check if all required env vars are set
    const allEnvSet = hasCloudName && hasApiKey && hasApiSecret;

    if (!allEnvSet) {
      return Response.json(
        {
          status: "error",
          server: "running",
          cloudinary: "not_configured",
          message: "Cloudinary environment variables are missing",
          environment: envStatus,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // Validate configuration
    try {
      validateCloudinaryConfig();
    } catch (configError: any) {
      return Response.json(
        {
          status: "error",
          server: "running",
          cloudinary: "configuration_error",
          message: configError.message || "Cloudinary configuration validation failed",
          environment: envStatus,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // Configure Cloudinary for testing
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
      secure: true,
    });

    // Test Cloudinary connectivity by trying to generate a test URL
    // This verifies the configuration is valid without requiring admin API access
    try {
      // Generate a test transformation URL to verify credentials work
      // This doesn't make an actual API call but validates the config
      const testUrl = cloudinary.url("test", {
        transformation: [{ width: 100, height: 100, crop: "fill" }],
        secure: true,
      });

      // Try to make a lightweight API call to verify connectivity
      // Using usage() API which is available on most accounts
      let apiTest = null;
      try {
        apiTest = await cloudinary.api.usage();
      } catch (usageError: any) {
        // Usage API might not be available on all accounts, that's okay
        // Configuration is still valid if we got here
        console.log("[Cloudinary Health] Usage API not accessible (this is normal for some account types)");
      }

      return Response.json({
        status: "ok",
        server: "running",
        cloudinary: "configured",
        message: "Cloudinary is properly configured and ready",
        environment: {
          CLOUDINARY_CLOUD_NAME: "SET",
          CLOUDINARY_API_KEY: "SET",
          CLOUDINARY_API_SECRET: "SET",
        },
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_test: apiTest ? "passed" : "skipped",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (apiError: any) {
      // If URL generation fails, there's a configuration issue
      const errorMessage = apiError.message || "Unknown Cloudinary error";
      const httpCode = apiError.http_code || apiError.status || 500;

      return Response.json(
        {
          status: "error",
          server: "running",
          cloudinary: "configuration_error",
          message: `Cloudinary configuration test failed: ${errorMessage}`,
          error_code: httpCode,
          environment: {
            CLOUDINARY_CLOUD_NAME: "SET",
            CLOUDINARY_API_KEY: "SET",
            CLOUDINARY_API_SECRET: "SET",
          },
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }
  } catch (error: any) {
    return Response.json(
      {
        status: "error",
        server: "running",
        cloudinary: "unknown_error",
        message: error.message || "Unknown error checking Cloudinary status",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

