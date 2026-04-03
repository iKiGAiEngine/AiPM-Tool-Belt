import { useQuery } from "@tanstack/react-query";

export function useFeatureAccess() {
  const { data: features = [] } = useQuery({
    queryKey: ["/api/user/features"],
    queryFn: async () => {
      const res = await fetch("/api/user/features");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: Infinity, // Features don't change during session
  });

  const hasFeature = (feature: string): boolean => {
    return features.includes(feature);
  };

  return { features, hasFeature };
}
