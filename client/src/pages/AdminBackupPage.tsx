import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackupRestoreSection } from "@/pages/AdminPage";

export default function AdminBackupPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background" data-testid="page-admin-backup">
      <div className="max-w-5xl mx-auto px-6 pt-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm" data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Admin Dashboard
          </Button>
        </Link>
      </div>
      <BackupRestoreSection />
    </div>
  );
}
