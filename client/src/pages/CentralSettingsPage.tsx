import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Building2, Package, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Vendor, Div10Product } from "@shared/schema";
import { DIV10_SCOPE_CATEGORIES } from "@shared/schema";

export default function CentralSettingsPage() {
  const [activeTab, setActiveTab] = useState("vendors");

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage vendors and product dictionary</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="vendors" className="gap-2" data-testid="tab-vendors">
            <Building2 className="w-4 h-4" />
            Vendor Profiles
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2" data-testid="tab-products">
            <Package className="w-4 h-4" />
            Product Dictionary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <VendorSection />
        </TabsContent>

        <TabsContent value="products">
          <ProductSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VendorSection() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/settings/vendors"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/settings/vendors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/vendors"] });
      toast({ title: "Vendor deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete vendor", variant: "destructive" });
    },
  });

  const filteredVendors = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.shortName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Vendor Profiles</CardTitle>
            <CardDescription>
              Manage vendor information and quote parsing patterns
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-vendor">
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-vendors"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading vendors...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "No vendors found" : "No vendors added yet. Click 'Add Vendor' to get started."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVendors.map((vendor) => (
              <div
                key={vendor.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
                data-testid={`vendor-row-${vendor.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{vendor.name}</span>
                    {vendor.shortName && (
                      <Badge variant="secondary">{vendor.shortName}</Badge>
                    )}
                    {!vendor.isActive && (
                      <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                  {vendor.modelPrefixes && vendor.modelPrefixes.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">Model prefixes:</span>
                      {vendor.modelPrefixes.map((prefix, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{prefix}</Badge>
                      ))}
                    </div>
                  )}
                  {vendor.notes && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{vendor.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingVendor(vendor)}
                    data-testid={`button-edit-vendor-${vendor.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("Delete this vendor?")) {
                        deleteMutation.mutate(vendor.id);
                      }
                    }}
                    data-testid={`button-delete-vendor-${vendor.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <VendorDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        vendor={null}
        mode="add"
      />

      {editingVendor && (
        <VendorDialog
          open={!!editingVendor}
          onOpenChange={(open) => !open && setEditingVendor(null)}
          vendor={editingVendor}
          mode="edit"
        />
      )}
    </Card>
  );
}

interface VendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: Vendor | null;
  mode: "add" | "edit";
}

function VendorDialog({ open, onOpenChange, vendor, mode }: VendorDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(vendor?.name ?? "");
  const [shortName, setShortName] = useState(vendor?.shortName ?? "");
  const [modelPrefixes, setModelPrefixes] = useState(vendor?.modelPrefixes?.join(", ") ?? "");
  const [quotePatterns, setQuotePatterns] = useState(vendor?.quotePatterns?.join("\n") ?? "");
  const [contactEmail, setContactEmail] = useState(vendor?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(vendor?.contactPhone ?? "");
  const [website, setWebsite] = useState(vendor?.website ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Vendor>) => {
      await apiRequest("POST", "/api/settings/vendors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/vendors"] });
      toast({ title: "Vendor created" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create vendor", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Vendor>) => {
      await apiRequest("PUT", `/api/settings/vendors/${vendor?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/vendors"] });
      toast({ title: "Vendor updated" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update vendor", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const data = {
      name,
      shortName: shortName || null,
      modelPrefixes: modelPrefixes.split(",").map((s) => s.trim()).filter(Boolean),
      quotePatterns: quotePatterns.split("\n").map((s) => s.trim()).filter(Boolean),
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      website: website || null,
      notes: notes || null,
    };

    if (mode === "add") {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Vendor" : "Edit Vendor"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Add a new vendor profile for quote parsing"
              : "Update vendor information and parsing patterns"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Vendor Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Activar/Maxam"
                data-testid="input-vendor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortName">Short Name</Label>
              <Input
                id="shortName"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g., Activar"
                data-testid="input-vendor-shortname"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modelPrefixes">Model Prefixes (comma-separated)</Label>
            <Input
              id="modelPrefixes"
              value={modelPrefixes}
              onChange={(e) => setModelPrefixes(e.target.value)}
              placeholder="e.g., FEA, C2037, B-"
              data-testid="input-vendor-prefixes"
            />
            <p className="text-xs text-muted-foreground">
              Model number prefixes to help identify products from this vendor
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quotePatterns">Quote Identification Patterns (one per line)</Label>
            <Textarea
              id="quotePatterns"
              value={quotePatterns}
              onChange={(e) => setQuotePatterns(e.target.value)}
              placeholder="e.g., ACTIVAR CONSTRUCTION&#10;MAXAM&#10;SQ02630"
              rows={3}
              data-testid="input-vendor-patterns"
            />
            <p className="text-xs text-muted-foreground">
              Text patterns that identify quotes from this vendor
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="sales@vendor.com"
                data-testid="input-vendor-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
                data-testid="input-vendor-phone"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.vendor.com"
              data-testid="input-vendor-website"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this vendor..."
              rows={2}
              data-testid="input-vendor-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-vendor"
          >
            {mode === "add" ? "Add Vendor" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductSection() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [editingProduct, setEditingProduct] = useState<Div10Product | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery<Div10Product[]>({
    queryKey: ["/api/settings/products"],
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/settings/vendors"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/settings/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/products"] });
      toast({ title: "Product deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.modelNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesScope = scopeFilter === "all" || p.scopeCategory === scopeFilter;
    return matchesSearch && matchesScope;
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const scope = product.scopeCategory;
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(product);
    return acc;
  }, {} as Record<string, Div10Product[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Division 10 Product Dictionary</CardTitle>
            <CardDescription>
              Manage known products and model numbers for better quote parsing
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-product">
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-products"
            />
          </div>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-scope-filter">
              <SelectValue placeholder="All scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {DIV10_SCOPE_CATEGORIES.map((scope) => (
                <SelectItem key={scope} value={scope}>{scope}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery || scopeFilter !== "all"
              ? "No products found"
              : "No products added yet. Click 'Add Product' to get started."}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedProducts).map(([scope, scopeProducts]) => (
              <div key={scope}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  {scope}
                  <Badge variant="secondary">{scopeProducts.length}</Badge>
                </h3>
                <div className="space-y-2">
                  {scopeProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      data-testid={`product-row-${product.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{product.modelNumber}</span>
                          {product.manufacturer && (
                            <Badge variant="outline">{product.manufacturer}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {product.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingProduct(product)}
                          data-testid={`button-edit-product-${product.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this product?")) {
                              deleteMutation.mutate(product.id);
                            }
                          }}
                          data-testid={`button-delete-product-${product.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ProductDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        product={null}
        vendors={vendors}
        mode="add"
      />

      {editingProduct && (
        <ProductDialog
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          product={editingProduct}
          vendors={vendors}
          mode="edit"
        />
      )}
    </Card>
  );
}

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Div10Product | null;
  vendors: Vendor[];
  mode: "add" | "edit";
}

function ProductDialog({ open, onOpenChange, product, vendors, mode }: ProductDialogProps) {
  const { toast } = useToast();
  const [modelNumber, setModelNumber] = useState(product?.modelNumber ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? "");
  const [scopeCategory, setScopeCategory] = useState(product?.scopeCategory ?? "");
  const [vendorId, setVendorId] = useState<string>(product?.vendorId?.toString() ?? "");
  const [aliases, setAliases] = useState(product?.aliases?.join(", ") ?? "");
  const [typicalPrice, setTypicalPrice] = useState(product?.typicalPrice ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Div10Product>) => {
      await apiRequest("POST", "/api/settings/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/products"] });
      toast({ title: "Product created" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create product", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Div10Product>) => {
      await apiRequest("PUT", `/api/settings/products/${product?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/products"] });
      toast({ title: "Product updated" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const data = {
      modelNumber,
      description,
      manufacturer: manufacturer || null,
      scopeCategory,
      vendorId: vendorId ? parseInt(vendorId) : null,
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      typicalPrice: typicalPrice || null,
      notes: notes || null,
    };

    if (mode === "add") {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Product" : "Edit Product"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Add a new product to the Division 10 dictionary"
              : "Update product information"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modelNumber">Model Number *</Label>
              <Input
                id="modelNumber"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g., B-2111"
                className="font-mono"
                data-testid="input-product-model"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g., Bobrick"
                data-testid="input-product-manufacturer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Paper Towel Dispenser, Surface Mounted"
              rows={2}
              data-testid="input-product-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scopeCategory">Scope Category *</Label>
              <Select value={scopeCategory} onValueChange={setScopeCategory}>
                <SelectTrigger data-testid="select-product-scope">
                  <SelectValue placeholder="Select scope..." />
                </SelectTrigger>
                <SelectContent>
                  {DIV10_SCOPE_CATEGORIES.map((scope) => (
                    <SelectItem key={scope} value={scope}>{scope}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor</Label>
              <Select value={vendorId || "none"} onValueChange={(val) => setVendorId(val === "none" ? "" : val)}>
                <SelectTrigger data-testid="select-product-vendor">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">Aliases (comma-separated)</Label>
            <Input
              id="aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="e.g., B2111, 2111"
              data-testid="input-product-aliases"
            />
            <p className="text-xs text-muted-foreground">
              Alternative model numbers or names for this product
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="typicalPrice">Typical Price</Label>
              <Input
                id="typicalPrice"
                value={typicalPrice}
                onChange={(e) => setTypicalPrice(e.target.value)}
                placeholder="e.g., $185.00"
                data-testid="input-product-price"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this product..."
              rows={2}
              data-testid="input-product-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!modelNumber || !description || !scopeCategory || createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-product"
          >
            {mode === "add" ? "Add Product" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
