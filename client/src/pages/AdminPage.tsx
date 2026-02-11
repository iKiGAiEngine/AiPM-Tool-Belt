import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Loader2,
  ScrollText,
  Plus,
  Pencil,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

function UserFormDialog({
  open,
  onOpenChange,
  editUser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editUser: User | null;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState(editUser?.email || "");
  const [displayName, setDisplayName] = useState(editUser?.displayName || "");
  const [company, setCompany] = useState(editUser?.company || "");
  const [phone, setPhone] = useState(editUser?.phone || "");
  const [role, setRole] = useState(editUser?.role || "admin");

  const isEditing = !!editUser;

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/users", {
        email, displayName, company, phone, role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/users/${editUser!.id}/profile`, {
        email, displayName, company, phone,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit User Profile" : "Add New User"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="form-email">Email Address</Label>
            <Input
              id="form-email"
              type="email"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-form-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-name">Display Name</Label>
            <Input
              id="form-name"
              placeholder="John Smith"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="input-form-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="form-company">Company</Label>
              <Input
                id="form-company"
                placeholder="Company name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                data-testid="input-form-company"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-phone">Phone</Label>
              <Input
                id="form-phone"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-form-phone"
              />
            </div>
          </div>
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="form-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="form-role" data-testid="select-form-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-form-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()} data-testid="button-form-save">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                isEditing ? "Save Changes" : "Create User"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: usersList = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/toggle-active`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <Shield className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/audit">
                <Button variant="outline" size="sm" data-testid="link-audit-log">
                  <ScrollText className="w-3.5 h-3.5 mr-1.5" />
                  Audit Log
                </Button>
              </Link>
            </div>
          </div>
          <p className="text-muted-foreground ml-12">Manage users, profiles, and access control.</p>
        </div>

        <Card>
          <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
            <h2 className="font-medium">Users</h2>
            <Button size="sm" onClick={openCreateDialog} data-testid="button-add-user">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add User
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : usersList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users yet. Click "Add User" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  usersList.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="min-w-[180px]">
                          <div className="font-medium text-sm" data-testid={`text-email-${u.id}`}>
                            {u.displayName || u.email}
                          </div>
                          {u.displayName && (
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          )}
                          {u.phone && (
                            <div className="text-xs text-muted-foreground">{u.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.company || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                          className="text-xs"
                          data-testid={`badge-role-${u.id}`}
                        >
                          {u.role === "admin" ? (
                            <><ShieldCheck className="w-3 h-3 mr-1" /> Admin</>
                          ) : (
                            "User"
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${u.isActive ? "text-green-600 border-green-600/30 bg-green-500/10" : "text-red-600 border-red-600/30 bg-red-500/10"}`}
                          data-testid={`badge-status-${u.id}`}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(u)}
                            title="Edit profile"
                            data-testid={`button-edit-${u.id}`}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActiveMutation.mutate(u.id)}
                            disabled={toggleActiveMutation.isPending}
                            title={u.isActive ? "Deactivate user" : "Activate user"}
                            data-testid={`button-toggle-active-${u.id}`}
                          >
                            {u.isActive ? (
                              <UserX className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              changeRoleMutation.mutate({
                                userId: u.id,
                                role: u.role === "admin" ? "user" : "admin",
                              })
                            }
                            disabled={changeRoleMutation.isPending}
                            title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                            data-testid={`button-change-role-${u.id}`}
                          >
                            {u.role === "admin" ? (
                              <Shield className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {formOpen && (
        <UserFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingUser(null);
          }}
          editUser={editingUser}
        />
      )}
    </div>
  );
}
