import { NextRequest, NextResponse } from "next/server";
import { updateToss } from "@/controller/match";

// CORS headers helper
function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
    return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        // We need to pass the resolved params to the controller
        // Creating a new request-like object or just passing the ID might be tricky depending on controller signature
        // The controller expects { params: { id: string } }

        // Call controller with awaited params
        const response = await updateToss(req, { params: { id } });

        // Add CORS headers to response
        const headers = new Headers(response.headers);
        Object.entries(getCorsHeaders()).forEach(([key, value]) => {
            headers.set(key, value);
        });

        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: getCorsHeaders() }
        );
    }
}
