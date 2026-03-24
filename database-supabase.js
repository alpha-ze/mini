const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

class SupabaseDatabase {
    constructor() {
        console.log('Connected to Supabase');
    }

    async addGrievance(data) {
        try {
            // Map SQLite fields to Supabase schema
            const grievanceData = {
                category: this.mapDepartmentToCategory(data.department),
                description: data.grievance,
                is_anonymous: data.isAnonymous,
                user_id: data.userId,
                status: 'Submitted',
                image_url: null,
                video_url: null,
                user_name: data.userName || null,
                user_role: data.userRole || null,
                user_department: data.userDept || null,
            };

            // Parse media URLs if present
            if (data.mediaUrls) {
                const mediaArray = JSON.parse(data.mediaUrls);
                if (mediaArray.length > 0) {
                    // Store first image/video URL
                    const firstMedia = mediaArray[0];
                    if (firstMedia.type.startsWith('image/')) {
                        grievanceData.image_url = firstMedia.url;
                    } else if (firstMedia.type.startsWith('video/')) {
                        grievanceData.video_url = firstMedia.url;
                    }
                }
            }

            const { data: result, error } = await supabase
                .from('grievances')
                .insert([grievanceData])
                .select()
                .single();

            if (error) {
                console.error('Supabase insert error:', error);
                throw error;
            }

            // Return the grievance_id (GRV-000001 format)
            return result.grievance_id;
        } catch (error) {
            console.error('Error adding grievance:', error);
            throw error;
        }
    }

    async getAllGrievances() {
        try {
            const { data, error } = await supabase
                .from('grievances')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting grievances:', error);
            return [];
        }
    }

    async getGrievanceById(id) {
        try {
            const { data, error } = await supabase
                .from('grievances')
                .select('*')
                .eq('grievance_id', id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                console.error('Error getting grievance:', error);
            }
            return data || null;
        } catch (error) {
            console.error('Error getting grievance:', error);
            return null;
        }
    }

    async updateGrievance(id, response) {
        try {
            const { error } = await supabase
                .from('grievances')
                .update({
                    status: 'Resolved',
                    updated_at: new Date().toISOString()
                })
                .eq('grievance_id', id);

            if (error) throw error;

            // Add action to history
            await this.addGrievanceAction(id, 'System', response, 'Resolved');
        } catch (error) {
            console.error('Error updating grievance:', error);
            throw error;
        }
    }

    async updateGrievanceStatus(id, status) {
        try {
            const { error } = await supabase
                .from('grievances')
                .update({
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('grievance_id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating status:', error);
            throw error;
        }
    }

    async addGrievanceAction(grievanceId, adminName, remarks, newStatus) {
        try {
            // Get the UUID of the grievance
            const { data: grievance } = await supabase
                .from('grievances')
                .select('id')
                .eq('grievance_id', grievanceId)
                .single();

            if (!grievance) return;

            const { error } = await supabase
                .from('grievance_actions')
                .insert([{
                    grievance_id: grievance.id,
                    admin_name: adminName,
                    remarks: remarks,
                    new_status: newStatus
                }]);

            if (error) throw error;
        } catch (error) {
            console.error('Error adding action:', error);
        }
    }

    async getRecentGrievances(hours = 72) {
        try {
            const cutoffTime = new Date();
            cutoffTime.setHours(cutoffTime.getHours() - hours);

            const { data, error } = await supabase
                .from('grievances')
                .select('grievance_id, description, category, status, created_at')
                .gte('created_at', cutoffTime.toISOString())
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // Map to format expected by ML service
            return (data || []).map(g => ({
                id: g.grievance_id,
                description: g.description,
                category: g.category,
                status: g.status,
                created_at: g.created_at
            }));
        } catch (error) {
            console.error('Error getting recent grievances:', error);
            return [];
        }
    }

    async getGrievanceActions(grievanceUUID) {
        try {
            const { data, error } = await supabase
                .from('grievance_actions')
                .select('remarks, new_status, admin_name, created_at')
                .eq('grievance_id', grievanceUUID)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting grievance actions:', error);
            return [];
        }
    }

    async markResponseSent(id) {
        // Not needed in Supabase - we track this differently
        return Promise.resolve();
    }

    // Helper function to map old department names to new categories
    mapDepartmentToCategory(department) {
        const mapping = {
            'Academic': 'Academic',
            'Hostel': 'Hostel',
            'Faculty': 'Academic',
            'Infrastructure': 'Infrastructure',
            'IT Cell': 'IT Cell',
            'Maintenance': 'Maintenance',
            'Transport': 'Transport',
            'Accounts': 'Accounts'
        };
        return mapping[department] || 'Other';
    }
}

module.exports = SupabaseDatabase;
