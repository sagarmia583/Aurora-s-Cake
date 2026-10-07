import React from 'react';
import { AnalyticsDashboard, AnalyticsDashboardProps } from './AnalyticsDashboard';
import { Order, Product } from '../types';

export interface AdminAnalyticsSectionProps {
  orders: Order[];
  products: Product[];
  currency?: string;
  categories?: any[];
}

export const AdminAnalyticsSection: React.FC<AdminAnalyticsSectionProps> = (props) => {
  return <AnalyticsDashboard {...props} />;
};

export default AdminAnalyticsSection;
