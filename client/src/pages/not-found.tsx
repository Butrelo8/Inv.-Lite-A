import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4 shadow-xl border-border/60">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Página no encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            La página que buscas no existe.
          </p>
          
          <div className="mt-8">
             <Link href="/">
               <Button className="w-full">
                 Volver al inicio
               </Button>
             </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
