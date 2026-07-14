import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCATION_TRACK_TASK = 'enable-background-location-updates';

TaskManager.defineTask(LOCATION_TRACK_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data;
    const location = locations[0];
    
    if (location) {
      try {
        const sessionsJson = await AsyncStorage.getItem('active_tracking_sessions');
        const sessions: { orderId: string; tenantId: string }[] = sessionsJson ? JSON.parse(sessionsJson) : [];

        const updates = sessions.map(session => 
          supabase.from('live_tracking').upsert({
            id: session.orderId,
            tenant_id: session.tenantId,
            active: true,
            coords: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              heading: location.coords.heading || 0,
              speed: location.coords.speed || 0,
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' })
        );

        await Promise.all(updates);
      } catch (err) {
        console.error('Error in background location task:', err);
      }
    }
  }
});

export interface StoreLocation {
  id: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  address: string;
  addressAr?: string;
  addressKu?: string;
  phone: string;
  email?: string;
  city: string;
  latitude: number;
  longitude: number;
  type: 'main' | 'branch' | 'service';
  isActive: boolean;
  workingHours?: Record<string, { open: string; close: string; isOpen: boolean }>;
  createdByAdminId: string;
  createdAt?: any;
  updatedAt?: any;
}

export class LocationService {
  private activeTrackingIds: Set<string> = new Set();

  async init() {
    try {
      const sessionsJson = await AsyncStorage.getItem('active_tracking_sessions');
      if (sessionsJson) {
        const sessions: { orderId: string }[] = JSON.parse(sessionsJson);
        sessions.forEach(s => this.activeTrackingIds.add(s.orderId));
      }
    } catch (e) {
      console.warn('Failed to rehydrate tracking sessions', e);
    }
  }

  isTracking(orderId: string): boolean {
    return this.activeTrackingIds.has(orderId);
  }

  async startTracking(orderId: string, tenantId: string) {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') throw new Error('Location permission denied');

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('Background location permission denied');
      throw new Error('Background location permission required for live tracking');
    }

    const sessionsJson = await AsyncStorage.getItem('active_tracking_sessions');
    const sessions: { orderId: string; tenantId: string }[] = sessionsJson ? JSON.parse(sessionsJson) : [];
    
    if (!sessions.find(s => s.orderId === orderId)) {
      sessions.push({ orderId, tenantId });
      await AsyncStorage.setItem('active_tracking_sessions', JSON.stringify(sessions));
    }

    this.activeTrackingIds.add(orderId);

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACK_TASK);
    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TRACK_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Delivery Tracking Active",
          notificationBody: "Your location is being shared with the customer.",
          notificationColor: "#1a365d"
        }
      });
    }
  }

  async stopTracking(orderId: string) {
    const sessionsJson = await AsyncStorage.getItem('active_tracking_sessions');
    let sessions: { orderId: string; tenantId: string }[] = sessionsJson ? JSON.parse(sessionsJson) : [];
    
    sessions = sessions.filter(s => s.orderId !== orderId);
    await AsyncStorage.setItem('active_tracking_sessions', JSON.stringify(sessions));

    this.activeTrackingIds.delete(orderId);

    if (sessions.length === 0) {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACK_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACK_TASK);
      }
    }

    await supabase.from('live_tracking').update({ active: false, updated_at: new Date().toISOString() }).eq('id', orderId);
  }

  private mapDbToLocation(data: any): StoreLocation {
    return {
      id: data.id,
      name: data.name,
      nameAr: data.name_ar,
      nameKu: data.name_ku,
      address: data.address,
      addressAr: data.address_ar,
      addressKu: data.address_ku,
      phone: data.phone,
      email: data.email,
      city: data.city,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      type: data.type,
      isActive: data.is_active,
      workingHours: data.working_hours,
      createdByAdminId: data.created_by_admin_id,
      createdAt: data.created_at ? new Date(data.created_at) : undefined,
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
    };
  }

  async getLocationsByAdmin(adminId: string): Promise<StoreLocation[]> {
    try {
      const { data, error } = await supabase.from('store_locations').select('*').eq('created_by_admin_id', adminId);
      if (error) throw error;
      return (data || []).map(this.mapDbToLocation);
    } catch (error) {
      console.error('Error getting store locations:', error);
      throw error;
    }
  }

  async getLocationById(locationId: string): Promise<StoreLocation | null> {
    try {
      const { data, error } = await supabase.from('store_locations').select('*').eq('id', locationId).single();
      if (error || !data) return null;
      return this.mapDbToLocation(data);
    } catch (error) {
      console.error('Error getting location by ID:', error);
      throw error;
    }
  }

  async addLocation(data: Omit<StoreLocation, 'id' | 'createdAt' | 'updatedAt'>, adminId: string): Promise<string> {
    try {
      const insertData = {
        name: data.name,
        name_ar: data.nameAr,
        name_ku: data.nameKu,
        address: data.address,
        address_ar: data.addressAr,
        address_ku: data.addressKu,
        phone: data.phone,
        email: data.email,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        type: data.type,
        is_active: data.isActive,
        working_hours: data.workingHours,
        created_by_admin_id: adminId,
      };

      const { data: resultData, error } = await supabase.from('store_locations').insert([insertData]).select().single();
      if (error) throw error;
      return resultData.id;
    } catch (error) {
      console.error('Error adding location:', error);
      throw error;
    }
  }

  async updateLocation(locationId: string, data: Partial<StoreLocation>, adminId: string): Promise<void> {
    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      
      if (data.name !== undefined) updateData.name = data.name;
      if (data.nameAr !== undefined) updateData.name_ar = data.nameAr;
      if (data.nameKu !== undefined) updateData.name_ku = data.nameKu;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.addressAr !== undefined) updateData.address_ar = data.addressAr;
      if (data.addressKu !== undefined) updateData.address_ku = data.addressKu;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.latitude !== undefined) updateData.latitude = data.latitude;
      if (data.longitude !== undefined) updateData.longitude = data.longitude;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;
      if (data.workingHours !== undefined) updateData.working_hours = data.workingHours;

      const { error } = await supabase.from('store_locations').update(updateData).eq('id', locationId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  }

  async deleteLocation(locationId: string, adminId: string): Promise<void> {
    try {
      const { error } = await supabase.from('store_locations').delete().eq('id', locationId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting location:', error);
      throw error;
    }
  }

  async canAdminModifyLocation(locationId: string, adminId: string): Promise<boolean> {
    try {
      const location = await this.getLocationById(locationId);
      return location?.createdByAdminId === adminId;
    } catch (error) {
      console.error('Error checking location permission:', error);
      return false;
    }
  }

  getStoreTypeColor(type: string): string {
    switch (type) {
      case 'main': return '#2196F3';
      case 'branch': return '#4CAF50';
      case 'service': return '#FF9800';
      default: return '#757575';
    }
  }
}

export const locationService = new LocationService();
