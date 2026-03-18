import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useBalance() {
  return useQuery(api.queries.getBalance);
}

export function useHealthScore() {
  return useQuery(api.queries.getHealthScore);
}

export function useTrajectory() {
  return useQuery(api.queries.getTrajectory);
}

export function useProgress() {
  return useQuery(api.queries.getProgress);
}

export function useTransactions() {
  return useQuery(api.queries.getTransactions);
}

export function useIncome() {
  return useQuery(api.queries.getIncome);
}

export function useSpending() {
  return useQuery(api.queries.getSpending);
}

export function useTrends() {
  return useQuery(api.queries.getTrends);
}

export function usePlans() {
  return useQuery(api.queries.getPlans);
}

export function useInsights() {
  return useQuery(api.queries.getInsights);
}

export function usePensionAccounts() {
  return useQuery(api.queries.getPensionAccounts);
}

export function usePensionHistory() {
  return useQuery(api.queries.getPensionHistory);
}
