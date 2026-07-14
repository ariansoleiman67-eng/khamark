import { supabase } from './supabase';
import { Address } from '../types';
import PhoneNumberService from './phoneNumberService';
import { getCountryByCode, getCityByCode } from '../constants/countries';

export interface AddressInput {
  title: string;
  fullName: string;
  phone: string;
  address: string;
  countryCode: string;
  cityCode: string;
  city: string; // For backward compatibility
  region: string; // For backward compatibility
  landmark?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  formattedAddress?: string;
  addressComponents?: {
    street?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  isDefault?: boolean;
}

class AddressService {
  private mapDbToAddress(data: any): Address {
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      fullName: data.full_name,
      phone: data.phone,
      address: data.address,
      countryCode: data.country_code,
      cityCode: data.city_code,
      city: data.city,
      region: data.region,
      landmark: data.landmark,
      coordinates: data.coordinates,
      formattedAddress: data.formatted_address,
      addressComponents: data.address_components,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getUserAddresses(userId: string): Promise<Address[]> {
    try {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(d => this.mapDbToAddress(d));
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      throw new Error('Failed to fetch addresses');
    }
  }

  async addAddress(userId: string, addressData: AddressInput): Promise<string> {
    try {
      const existingAddresses = await this.getUserAddresses(userId);
      const isFirstAddress = existingAddresses.length === 0;
      
      if (isFirstAddress) {
        addressData.isDefault = true;
      }
      
      if (addressData.isDefault) {
        await this.removeDefaultFromOtherAddresses(userId);
      }
      
      const insertData = {
        user_id: userId,
        title: addressData.title,
        full_name: addressData.fullName,
        phone: addressData.phone,
        address: addressData.address,
        country_code: addressData.countryCode,
        city_code: addressData.cityCode,
        city: addressData.city,
        region: addressData.region,
        landmark: addressData.landmark,
        coordinates: addressData.coordinates,
        formatted_address: addressData.formattedAddress,
        address_components: addressData.addressComponents,
        is_default: addressData.isDefault || false,
      };
      
      const { data, error } = await supabase
        .from('addresses')
        .insert([insertData])
        .select()
        .single();
        
      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error adding address:', error);
      throw new Error('Failed to add address');
    }
  }

  async updateAddress(addressId: string, userId: string, addressData: Partial<AddressInput>): Promise<void> {
    try {
      if (addressData.isDefault) {
        await this.removeDefaultFromOtherAddresses(userId, addressId);
      }

      const updateData: any = { updated_at: new Date().toISOString() };
      
      if (addressData.title !== undefined) updateData.title = addressData.title;
      if (addressData.fullName !== undefined) updateData.full_name = addressData.fullName;
      if (addressData.phone !== undefined) updateData.phone = addressData.phone;
      if (addressData.address !== undefined) updateData.address = addressData.address;
      if (addressData.countryCode !== undefined) updateData.country_code = addressData.countryCode;
      if (addressData.cityCode !== undefined) updateData.city_code = addressData.cityCode;
      if (addressData.city !== undefined) updateData.city = addressData.city;
      if (addressData.region !== undefined) updateData.region = addressData.region;
      if (addressData.landmark !== undefined) updateData.landmark = addressData.landmark;
      if (addressData.coordinates !== undefined) updateData.coordinates = addressData.coordinates;
      if (addressData.formattedAddress !== undefined) updateData.formatted_address = addressData.formattedAddress;
      if (addressData.addressComponents !== undefined) updateData.address_components = addressData.addressComponents;
      if (addressData.isDefault !== undefined) updateData.is_default = addressData.isDefault;

      const { error } = await supabase.from('addresses').update(updateData).eq('id', addressId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating address:', error);
      throw new Error('Failed to update address');
    }
  }

  async deleteAddress(addressId: string): Promise<void> {
    try {
      const { error } = await supabase.from('addresses').delete().eq('id', addressId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting address:', error);
      throw new Error('Failed to delete address');
    }
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    try {
      await this.removeDefaultFromOtherAddresses(userId, addressId);
      const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', addressId);
      if (error) throw error;
    } catch (error) {
      console.error('Error setting default address:', error);
      throw new Error('Failed to set default address');
    }
  }

  async getDefaultAddress(userId: string): Promise<Address | null> {
    try {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .limit(1);
        
      if (error || !data || data.length === 0) return null;
      return this.mapDbToAddress(data[0]);
    } catch (error) {
      console.error('Error fetching default address:', error);
      throw new Error('Failed to fetch default address');
    }
  }

  private async removeDefaultFromOtherAddresses(userId: string, excludeAddressId?: string): Promise<void> {
    try {
      let query = supabase.from('addresses').update({ is_default: false }).eq('user_id', userId).eq('is_default', true);
      if (excludeAddressId) {
        query = query.neq('id', excludeAddressId);
      }
      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      console.error('Error removing default from other addresses:', error);
      throw error;
    }
  }

  validateAddress(addressData: AddressInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!addressData.title?.trim()) errors.push('Address title is required');
    if (!addressData.fullName?.trim()) errors.push('Full name is required');
    if (!addressData.phone?.trim()) errors.push('Phone number is required');
    if (!addressData.address?.trim()) errors.push('Street address is required');
    if (!addressData.countryCode?.trim()) errors.push('Country is required');
    if (!addressData.cityCode?.trim()) errors.push('City is required');

    const country = getCountryByCode(addressData.countryCode);
    if (!country) {
      errors.push('Invalid country selected');
    } else {
      const city = getCityByCode(addressData.countryCode, addressData.cityCode);
      if (!city) {
        errors.push('Invalid city selected for the country');
      }
    }

    if (addressData.phone && addressData.countryCode) {
      const phoneValidation = PhoneNumberService.validatePhone(addressData.phone, addressData.countryCode);
      if (!phoneValidation.isValid) {
        errors.push(phoneValidation.error || 'Invalid phone number format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  validateIraqAddress(addressData: AddressInput): { isValid: boolean; errors: string[] } {
    const modernAddressData = {
      ...addressData,
      countryCode: addressData.countryCode || 'IQ',
      cityCode: addressData.cityCode || 'ERB',
    };
    return this.validateAddress(modernAddressData);
  }

  getCitiesForCountry(countryCode: string): string[] {
    const country = getCountryByCode(countryCode);
    return country ? country.cities.map(city => city.name) : [];
  }

  getCitiesForRegion(region: string): string[] {
    const regionToCountry: Record<string, string> = {
      'Iraq': 'IQ',
      'Syria': 'SY',
      'Iran': 'IR',
      'Turkey': 'TR',
    };
    
    const countryCode = regionToCountry[region] || 'IQ';
    return this.getCitiesForCountry(countryCode);
  }

  getSupportedCountries(): string[] {
    return ['Iraq', 'Syria', 'Iran', 'Turkey'];
  }

  getIraqiRegions(): string[] {
    return this.getSupportedCountries();
  }
}

export const addressService = new AddressService();
export default addressService;
