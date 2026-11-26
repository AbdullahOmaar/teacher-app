/**
 * أنواع قاعدة البيانات المولّدة من المخطط الحي — COD-1 (3A-373).
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   python3 scripts/gen_db_types.py
 * Source: Supabase project qkwdyqocazwhojpyifbv (public schema), .
 * Shape mirrors `supabase gen types typescript` output.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string
          teacher_id: string
          actor_id: string | null
          actor_role: string
          actor_name: string | null
          event_type: string
          entity_type: string | null
          entity_id: string | null
          entity_label: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          actor_id?: string | null
          actor_role: string
          actor_name?: string | null
          event_type: string
          entity_type?: string | null
          entity_id?: string | null
          entity_label?: string | null
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          actor_id?: string | null
          actor_role?: string
          actor_name?: string | null
          event_type?: string
          entity_type?: string | null
          entity_id?: string | null
          entity_label?: string | null
          details?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          id: string
          teacher_id: string
          assessment_id: string
          position: number
          type: Database["public"]["Enums"]["question_type"]
          text: string
          options: Json | null
          correct_answer: string | null
          points: number
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          assessment_id: string
          position?: number
          type?: Database["public"]["Enums"]["question_type"]
          text: string
          options?: Json | null
          correct_answer?: string | null
          points?: number
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          assessment_id?: string
          position?: number
          type?: Database["public"]["Enums"]["question_type"]
          text?: string
          options?: Json | null
          correct_answer?: string | null
          points?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          id: string
          teacher_id: string
          group_id: string
          title: string
          type: Database["public"]["Enums"]["assessment_type"]
          assess_date: string
          max_score: number
          pass_score: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          group_id: string
          title: string
          type?: Database["public"]["Enums"]["assessment_type"]
          assess_date?: string
          max_score: number
          pass_score?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          group_id?: string
          title?: string
          type?: Database["public"]["Enums"]["assessment_type"]
          assess_date?: string
          max_score?: number
          pass_score?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      at_risk_followups: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          followed_by: string | null
          followed_at: string
          note: string | null
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          followed_by?: string | null
          followed_at?: string
          note?: string | null
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          followed_by?: string | null
          followed_at?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "at_risk_followups_followed_by_fkey"
            columns: ["followed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "at_risk_followups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "at_risk_followups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          teacher_id: string
          session_id: string
          student_id: string
          status: Database["public"]["Enums"]["attendance_status"] | null
          homework_done: boolean
          starred: boolean
          created_at: string
          updated_at: string
          left_at: string | null
        }
        Insert: {
          teacher_id: string
          session_id: string
          student_id: string
          status?: Database["public"]["Enums"]["attendance_status"] | null
          homework_done?: boolean
          starred?: boolean
          created_at?: string
          updated_at?: string
          left_at?: string | null
        }
        Update: {
          teacher_id?: string
          session_id?: string
          student_id?: string
          status?: Database["public"]["Enums"]["attendance_status"] | null
          homework_done?: boolean
          starred?: boolean
          created_at?: string
          updated_at?: string
          left_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_closings: {
        Row: {
          id: string
          teacher_id: string
          closing_date: string
          expected_cash: number
          expected_electronic: number
          expenses_total: number
          counted_cash: number
          counted_electronic: number
          note: string | null
          closed_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          closing_date: string
          expected_cash: number
          expected_electronic: number
          expenses_total?: number
          counted_cash: number
          counted_electronic?: number
          note?: string | null
          closed_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          closing_date?: string
          expected_cash?: number
          expected_electronic?: number
          expenses_total?: number
          counted_cash?: number
          counted_electronic?: number
          note?: string | null
          closed_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_closings_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          id: string
          teacher_id: string | null
          reporter_user_id: string | null
          kind: string
          message: string
          stack: string | null
          route: string | null
          app_version: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id?: string | null
          reporter_user_id?: string | null
          kind: string
          message: string
          stack?: string | null
          route?: string | null
          app_version?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string | null
          reporter_user_id?: string | null
          kind?: string
          message?: string
          stack?: string | null
          route?: string | null
          app_version?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          group_id: string
          price_override: number | null
          prepaid_sessions: number | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          group_id: string
          price_override?: number | null
          prepaid_sessions?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          group_id?: string
          price_override?: number | null
          prepaid_sessions?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolment_links: {
        Row: {
          teacher_id: string
          token_hash: string
          enabled: boolean
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          teacher_id: string
          token_hash: string
          enabled?: boolean
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          teacher_id?: string
          token_hash?: string
          enabled?: boolean
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_links_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          id: string
          teacher_id: string
          exam_id: string
          student_id: string
          attempt_no: number
          status: Database["public"]["Enums"]["exam_attempt_status"]
          seed: string
          presentation: Json
          answers: Json
          started_at: string
          submitted_at: string | null
          score: number | null
          max_score: number | null
          pct: number | null
          score_posted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          exam_id: string
          student_id: string
          attempt_no: number
          status?: Database["public"]["Enums"]["exam_attempt_status"]
          seed: string
          presentation: Json
          answers?: Json
          started_at?: string
          submitted_at?: string | null
          score?: number | null
          max_score?: number | null
          pct?: number | null
          score_posted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          exam_id?: string
          student_id?: string
          attempt_no?: number
          status?: Database["public"]["Enums"]["exam_attempt_status"]
          seed?: string
          presentation?: Json
          answers?: Json
          started_at?: string
          submitted_at?: string | null
          score?: number | null
          max_score?: number | null
          pct?: number | null
          score_posted?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "online_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_start_throttle: {
        Row: {
          id: number
          exam_id: string
          code_norm: string
          created_at: string
        }
        Insert: {
          id?: number
          exam_id: string
          code_norm: string
          created_at?: string
        }
        Update: {
          id?: number
          exam_id?: string
          code_norm?: string
          created_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          teacher_id: string
          expense_date: string
          category: string
          amount: number
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          expense_date?: string
          category: string
          amount: number
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          expense_date?: string
          category?: string
          amount?: number
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      group_waitlist: {
        Row: {
          id: string
          teacher_id: string
          group_id: string
          name: string
          phone: string | null
          note: string | null
          created_at: string
          source: string
          wants_trial: boolean
        }
        Insert: {
          id?: string
          teacher_id: string
          group_id: string
          name: string
          phone?: string | null
          note?: string | null
          created_at?: string
          source?: string
          wants_trial?: boolean
        }
        Update: {
          id?: string
          teacher_id?: string
          group_id?: string
          name?: string
          phone?: string | null
          note?: string | null
          created_at?: string
          source?: string
          wants_trial?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "group_waitlist_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_waitlist_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          id: string
          teacher_id: string
          name: string
          billing_type: Database["public"]["Enums"]["billing_type"]
          price: number
          days: number[]
          start_time: string
          duration_minutes: number
          room: string | null
          capacity: number | null
          assistant_name: string | null
          links: string[]
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          teacher_id: string
          name: string
          billing_type?: Database["public"]["Enums"]["billing_type"]
          price?: number
          days?: number[]
          start_time: string
          duration_minutes?: number
          room?: string | null
          capacity?: number | null
          assistant_name?: string | null
          links?: string[]
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          teacher_id?: string
          name?: string
          billing_type?: Database["public"]["Enums"]["billing_type"]
          price?: number
          days?: number[]
          start_time?: string
          duration_minutes?: number
          room?: string | null
          capacity?: number | null
          assistant_name?: string | null
          links?: string[]
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_access_tokens: {
        Row: {
          id: string
          teacher_id: string
          guardian_id: string
          student_id: string | null
          token_hash: string
          expires_at: string
          revoked_at: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          guardian_id: string
          student_id?: string | null
          token_hash: string
          expires_at: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          guardian_id?: string
          student_id?: string | null
          token_hash?: string
          expires_at?: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_access_tokens_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_access_tokens_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_access_tokens_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_notifications: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          guardian_id: string | null
          session_id: string
          kind: Database["public"]["Enums"]["guardian_notification_kind"]
          event_at: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          guardian_id?: string | null
          session_id: string
          kind: Database["public"]["Enums"]["guardian_notification_kind"]
          event_at?: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          guardian_id?: string | null
          session_id?: string
          kind?: Database["public"]["Enums"]["guardian_notification_kind"]
          event_at?: string
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_notifications_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notifications_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_students: {
        Row: {
          teacher_id: string
          guardian_id: string
          student_id: string
          relationship: string | null
          created_at: string
        }
        Insert: {
          teacher_id: string
          guardian_id: string
          student_id: string
          relationship?: string | null
          created_at?: string
        }
        Update: {
          teacher_id?: string
          guardian_id?: string
          student_id?: string
          relationship?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_students_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          id: string
          teacher_id: string
          user_id: string | null
          display_name: string
          phone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          user_id?: string | null
          display_name?: string
          phone: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          user_id?: string | null
          display_name?: string
          phone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          id: string
          teacher_id: string
          holiday_date: string
          name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          holiday_date: string
          name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          holiday_date?: string
          name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          id: string
          teacher_id: string
          invoice_id: string
          line_type: Database["public"]["Enums"]["invoice_line_type"]
          description: string
          amount: number
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          invoice_id: string
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
          description: string
          amount: number
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          invoice_id?: string
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
          description?: string
          amount?: number
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          group_id: string
          period_month: string
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          group_id: string
          period_month: string
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          group_id?: string
          period_month?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      online_exam_tokens: {
        Row: {
          id: string
          teacher_id: string
          exam_id: string
          token_hash: string
          expires_at: string
          revoked_at: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          exam_id: string
          token_hash: string
          expires_at: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          exam_id?: string
          token_hash?: string
          expires_at?: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_exam_tokens_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "online_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_exam_tokens_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      online_exams: {
        Row: {
          id: string
          teacher_id: string
          assessment_id: string
          group_id: string
          status: Database["public"]["Enums"]["online_exam_status"]
          duration_minutes: number | null
          max_attempts: number
          starts_at: string | null
          ends_at: string | null
          allow_review: boolean
          shuffle_questions: boolean
          shuffle_options: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          assessment_id: string
          group_id: string
          status?: Database["public"]["Enums"]["online_exam_status"]
          duration_minutes?: number | null
          max_attempts?: number
          starts_at?: string | null
          ends_at?: string | null
          allow_review?: boolean
          shuffle_questions?: boolean
          shuffle_options?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          assessment_id?: string
          group_id?: string
          status?: Database["public"]["Enums"]["online_exam_status"]
          duration_minutes?: number | null
          max_attempts?: number
          starts_at?: string | null
          ends_at?: string | null
          allow_review?: boolean
          shuffle_questions?: boolean
          shuffle_options?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_exams_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_exams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_exams_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          id: string
          teacher_id: string
          guardian_id: string
          student_id: string
          invoice_id: string | null
          amount: number
          method: Database["public"]["Enums"]["payment_method"]
          storage_path: string
          status: Database["public"]["Enums"]["payment_proof_status"]
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          payment_id: string | null
          uploaded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          guardian_id: string
          student_id: string
          invoice_id?: string | null
          amount: number
          method: Database["public"]["Enums"]["payment_method"]
          storage_path: string
          status?: Database["public"]["Enums"]["payment_proof_status"]
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          payment_id?: string | null
          uploaded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          guardian_id?: string
          student_id?: string
          invoice_id?: string | null
          amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          storage_path?: string
          status?: Database["public"]["Enums"]["payment_proof_status"]
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          payment_id?: string | null
          uploaded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          id: string
          teacher_id: string
          invoice_id: string
          amount: number
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          receipt_no: string
          reverses_payment_id: string | null
          voided: boolean
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          invoice_id: string
          amount: number
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          receipt_no: string
          reverses_payment_id?: string | null
          voided?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          invoice_id?: string
          amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          receipt_no?: string
          reverses_payment_id?: string | null
          voided?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
          granted_by: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          granted_by?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          user_id?: string
          granted_by?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          id: string
          admin_user_id: string | null
          action: string
          target_teacher_id: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          admin_user_id?: string | null
          action: string
          target_teacher_id?: string | null
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          admin_user_id?: string | null
          action?: string
          target_teacher_id?: string | null
          details?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_target_teacher_id_fkey"
            columns: ["target_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          value: Json
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      portal_accounts: {
        Row: {
          id: string
          teacher_id: string
          student_id: string | null
          guardian_id: string | null
          role: string
          username: string
          password_hash: string
          is_active: boolean
          failed_attempts: number
          locked_until: string | null
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id?: string | null
          guardian_id?: string | null
          role: string
          username: string
          password_hash: string
          is_active?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string | null
          guardian_id?: string | null
          role?: string
          username?: string
          password_hash?: string
          is_active?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_accounts_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_accounts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          id: string
          account_id: string
          teacher_id: string
          token_hash: string
          expires_at: string
          revoked_at: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          teacher_id: string
          token_hash: string
          expires_at: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          teacher_id?: string
          token_hash?: string
          expires_at?: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_log: {
        Row: {
          id: string
          subscription_id: string | null
          teacher_id: string | null
          endpoint_host: string | null
          title: string | null
          status: Database["public"]["Enums"]["push_delivery_status"]
          http_status: number | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id?: string | null
          teacher_id?: string | null
          endpoint_host?: string | null
          title?: string | null
          status: Database["public"]["Enums"]["push_delivery_status"]
          http_status?: number | null
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string | null
          teacher_id?: string | null
          endpoint_host?: string | null
          title?: string | null
          status?: Database["public"]["Enums"]["push_delivery_status"]
          http_status?: number | null
          error?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_log_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_digest_log: {
        Row: {
          id: string
          teacher_id: string
          digest_date: string
          sessions_count: number
          overdue_count: number
          overdue_amount: number
          sent_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          digest_date: string
          sessions_count?: number
          overdue_count?: number
          overdue_amount?: number
          sent_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          digest_date?: string
          sessions_count?: number
          overdue_count?: number
          overdue_amount?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_digest_log_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          teacher_id: string
          subscriber_kind: Database["public"]["Enums"]["push_subscriber_kind"]
          user_id: string | null
          portal_token_id: string | null
          guardian_id: string | null
          student_id: string | null
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          is_active: boolean
          disabled_at: string | null
          disabled_reason: string | null
          failure_count: number
          last_success_at: string | null
          last_failure_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          subscriber_kind: Database["public"]["Enums"]["push_subscriber_kind"]
          user_id?: string | null
          portal_token_id?: string | null
          guardian_id?: string | null
          student_id?: string | null
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          is_active?: boolean
          disabled_at?: string | null
          disabled_reason?: string | null
          failure_count?: number
          last_success_at?: string | null
          last_failure_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          subscriber_kind?: Database["public"]["Enums"]["push_subscriber_kind"]
          user_id?: string | null
          portal_token_id?: string | null
          guardian_id?: string | null
          student_id?: string | null
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          is_active?: boolean
          disabled_at?: string | null
          disabled_reason?: string | null
          failure_count?: number
          last_success_at?: string | null
          last_failure_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          id: string
          teacher_id: string
          purchase_id: string
          description: string
          quantity: number
          unit_price: number
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          purchase_id: string
          description: string
          quantity: number
          unit_price: number
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          purchase_id?: string
          description?: string
          quantity?: number
          unit_price?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          id: string
          teacher_id: string
          purchase_id: string
          amount: number
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          purchase_id: string
          amount: number
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          purchase_id?: string
          amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          id: string
          teacher_id: string
          supplier_id: string | null
          purchase_date: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          supplier_id?: string | null
          purchase_date?: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          supplier_id?: string | null
          purchase_date?: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_counters: {
        Row: {
          teacher_id: string
          counter_year: number
          last_number: number
        }
        Insert: {
          teacher_id: string
          counter_year: number
          last_number?: number
        }
        Update: {
          teacher_id?: string
          counter_year?: number
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_counters_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          id: string
          teacher_id: string
          category: string
          amount: number
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          category: string
          amount: number
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          category?: string
          amount?: number
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          id: string
          teacher_id: string
          sale_id: string
          description: string
          quantity: number
          unit_price: number
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          sale_id: string
          description: string
          quantity: number
          unit_price: number
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          sale_id?: string
          description?: string
          quantity?: number
          unit_price?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          id: string
          teacher_id: string
          student_id: string | null
          buyer_name: string | null
          sale_date: string
          amount_paid: number
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id?: string | null
          buyer_name?: string | null
          sale_date?: string
          amount_paid?: number
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string | null
          buyer_name?: string | null
          sale_date?: string
          amount_paid?: number
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          teacher_id: string
          assessment_id: string
          student_id: string
          score: number
          created_at: string
          updated_at: string
          source: string
          exam_attempt_id: string | null
        }
        Insert: {
          teacher_id: string
          assessment_id: string
          student_id: string
          score: number
          created_at?: string
          updated_at?: string
          source?: string
          exam_attempt_id?: string | null
        }
        Update: {
          teacher_id?: string
          assessment_id?: string
          student_id?: string
          score?: number
          created_at?: string
          updated_at?: string
          source?: string
          exam_attempt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_exam_attempt_id_fkey"
            columns: ["exam_attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          id: string
          teacher_id: string
          group_id: string
          session_date: string
          start_time: string
          duration_minutes: number
          kind: Database["public"]["Enums"]["session_kind"]
          status: Database["public"]["Enums"]["session_status"]
          origin_session_id: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          group_id: string
          session_date: string
          start_time: string
          duration_minutes?: number
          kind?: Database["public"]["Enums"]["session_kind"]
          status?: Database["public"]["Enums"]["session_status"]
          origin_session_id?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          group_id?: string
          session_date?: string
          start_time?: string
          duration_minutes?: number
          kind?: Database["public"]["Enums"]["session_kind"]
          status?: Database["public"]["Enums"]["session_status"]
          origin_session_id?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_origin_session_id_fkey"
            columns: ["origin_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_access_tokens: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          token_hash: string
          expires_at: string
          revoked_at: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          token_hash: string
          expires_at: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          token_hash?: string
          expires_at?: string
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_access_tokens_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_access_tokens_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notes: {
        Row: {
          id: string
          teacher_id: string
          student_id: string
          note_date: string
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          student_id: string
          note_date?: string
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          student_id?: string
          note_date?: string
          text?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          id: string
          teacher_id: string
          public_code: string
          name: string
          grade: string | null
          school: string | null
          paused: boolean
          phone: string | null
          guardian_name: string | null
          guardian_phone: string | null
          level_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          public_code?: string
          name: string
          grade?: string | null
          school?: string | null
          paused?: boolean
          phone?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          level_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          public_code?: string
          name?: string
          grade?: string | null
          school?: string | null
          paused?: boolean
          phone?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          level_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_allowlist: {
        Row: {
          id: string
          email: string | null
          phone: string | null
          note: string | null
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          phone?: string | null
          note?: string | null
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          phone?: string | null
          note?: string | null
          added_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      teacher_feedback: {
        Row: {
          id: string
          teacher_id: string
          author_user_id: string
          kind: string
          body: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          author_user_id: string
          kind?: string
          body: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          author_user_id?: string
          kind?: string
          body?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_feedback_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_members: {
        Row: {
          id: string
          teacher_id: string
          user_id: string | null
          role: Database["public"]["Enums"]["member_role"]
          permissions: Json
          status: Database["public"]["Enums"]["member_status"]
          created_at: string
          updated_at: string
          invited_email: string | null
        }
        Insert: {
          id?: string
          teacher_id: string
          user_id?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          permissions?: Json
          status?: Database["public"]["Enums"]["member_status"]
          created_at?: string
          updated_at?: string
          invited_email?: string | null
        }
        Update: {
          id?: string
          teacher_id?: string
          user_id?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          permissions?: Json
          status?: Database["public"]["Enums"]["member_status"]
          created_at?: string
          updated_at?: string
          invited_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_members_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_settings: {
        Row: {
          teacher_id: string
          whatsapp_template: string
          center_share_percent: number
          reminder_minutes: number
          theme: string
          last_export_at: string | null
          created_at: string
          updated_at: string
          brand_name: string | null
          brand_logo_path: string | null
          brand_accent: string | null
          print_font: string | null
          push_daily_digest_enabled: boolean
          push_daily_digest_time: string
          push_daily_digest_last_sent_on: string | null
          mascot_accessory: string
          show_mascot: boolean
          portal_link_ttl_days: number
          portal_guardian_show_attendance: boolean
          portal_guardian_show_scores: boolean
          portal_guardian_show_notes: boolean
          portal_guardian_show_money: boolean
          portal_guardian_show_groups: boolean
          portal_student_show_schedule: boolean
          portal_student_show_homework: boolean
          portal_student_show_grades: boolean
          portal_student_show_money: boolean
        }
        Insert: {
          teacher_id: string
          whatsapp_template?: string
          center_share_percent?: number
          reminder_minutes?: number
          theme?: string
          last_export_at?: string | null
          created_at?: string
          updated_at?: string
          brand_name?: string | null
          brand_logo_path?: string | null
          brand_accent?: string | null
          print_font?: string | null
          push_daily_digest_enabled?: boolean
          push_daily_digest_time?: string
          push_daily_digest_last_sent_on?: string | null
          mascot_accessory?: string
          show_mascot?: boolean
          portal_link_ttl_days?: number
          portal_guardian_show_attendance?: boolean
          portal_guardian_show_scores?: boolean
          portal_guardian_show_notes?: boolean
          portal_guardian_show_money?: boolean
          portal_guardian_show_groups?: boolean
          portal_student_show_schedule?: boolean
          portal_student_show_homework?: boolean
          portal_student_show_grades?: boolean
          portal_student_show_money?: boolean
        }
        Update: {
          teacher_id?: string
          whatsapp_template?: string
          center_share_percent?: number
          reminder_minutes?: number
          theme?: string
          last_export_at?: string | null
          created_at?: string
          updated_at?: string
          brand_name?: string | null
          brand_logo_path?: string | null
          brand_accent?: string | null
          print_font?: string | null
          push_daily_digest_enabled?: boolean
          push_daily_digest_time?: string
          push_daily_digest_last_sent_on?: string | null
          mascot_accessory?: string
          show_mascot?: boolean
          portal_link_ttl_days?: number
          portal_guardian_show_attendance?: boolean
          portal_guardian_show_scores?: boolean
          portal_guardian_show_notes?: boolean
          portal_guardian_show_money?: boolean
          portal_guardian_show_groups?: boolean
          portal_student_show_schedule?: boolean
          portal_student_show_homework?: boolean
          portal_student_show_grades?: boolean
          portal_student_show_money?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "teacher_settings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_whatsapp_config: {
        Row: {
          teacher_id: string
          enabled: boolean
          phone_number_id: string
          waba_id: string
          template_name: string
          template_language: string
          token_vault_secret_id: string | null
          token_updated_at: string | null
          last_test_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          teacher_id: string
          enabled?: boolean
          phone_number_id?: string
          waba_id?: string
          template_name?: string
          template_language?: string
          token_vault_secret_id?: string | null
          token_updated_at?: string | null
          last_test_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          teacher_id?: string
          enabled?: boolean
          phone_number_id?: string
          waba_id?: string
          template_name?: string
          template_language?: string
          token_vault_secret_id?: string | null
          token_updated_at?: string | null
          last_test_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_whatsapp_config_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_whatsapp_templates: {
        Row: {
          teacher_id: string
          kind: string
          template_name: string
          language: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          teacher_id: string
          kind: string
          template_name?: string
          language?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          teacher_id?: string
          kind?: string
          template_name?: string
          language?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_whatsapp_templates_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          teacher_id: string
          name: string
          phone: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          name: string
          phone?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          name?: string
          phone?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          phone: string | null
          created_at: string
          updated_at: string
          owner_user_id: string
          account_activated: boolean
        }
        Insert: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
          owner_user_id: string
          account_activated?: boolean
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
          owner_user_id?: string
          account_activated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "teachers_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_log: {
        Row: {
          id: string
          teacher_id: string
          kind: string
          template_name: string
          recipient_phone: string
          status: string
          meta_message_id: string | null
          error_code: number | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          kind: string
          template_name: string
          recipient_phone: string
          status?: string
          meta_message_id?: string | null
          error_code?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          teacher_id?: string
          kind?: string
          template_name?: string
          recipient_phone?: string
          status?: string
          meta_message_id?: string | null
          error_code?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_log_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invoice_balances: {
        Row: {
          invoice_id: string | null
          teacher_id: string | null
          student_id: string | null
          group_id: string | null
          period_month: string | null
          total: number | null
          paid: number | null
          balance: number | null
          is_paid: boolean | null
        }
        Relationships: []
      }
      monthly_centre_finance: {
        Row: {
          teacher_id: string | null
          month: string | null
          tuition_collected: number | null
          sales_total: number | null
          sales_collected: number | null
          purchases_total: number | null
          purchases_paid: number | null
          expenses: number | null
          net_cash: number | null
        }
        Relationships: []
      }
      monthly_profit: {
        Row: {
          teacher_id: string | null
          month: string | null
          collected: number | null
          expenses: number | null
          center_share_amount: number | null
          net_profit: number | null
        }
        Relationships: []
      }
      purchase_balances: {
        Row: {
          purchase_id: string | null
          teacher_id: string | null
          supplier_id: string | null
          purchase_date: string | null
          total: number | null
          paid: number | null
          remaining: number | null
        }
        Relationships: []
      }
      sale_balances: {
        Row: {
          sale_id: string | null
          teacher_id: string | null
          student_id: string | null
          sale_date: string | null
          total: number | null
          paid: number | null
          remaining: number | null
        }
        Relationships: []
      }
      supplier_payables: {
        Row: {
          teacher_id: string | null
          supplier_id: string | null
          purchases_count: number | null
          total: number | null
          paid: number | null
          remaining: number | null
        }
        Relationships: []
      }
      student_attendance_stats: {
        Row: {
          teacher_id: string | null
          student_id: string | null
          marked_sessions: number | null
          attended_sessions: number | null
          attendance_rate: number | null
        }
        Relationships: []
      }
      student_balances: {
        Row: {
          teacher_id: string | null
          student_id: string | null
          balance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_self_register: {
          Args: {
            p_email: string
            p_phone: string
          }
          Returns: boolean
        }
      claim_teacher_invites: {
          Args: Record<PropertyKey, never>
          Returns: Json
        }
      create_teacher_profile_for_self: {
          Args: {
            p_display_name: string
            p_phone: string
          }
          Returns: Json
        }
      create_purchase: {
          Args: {
            p_teacher_id: string
            p_supplier_id: string | null
            p_purchase_date: string | null
            p_note: string | null
            p_lines: Json
          }
          Returns: Json
        }
      create_sale: {
          Args: {
            p_teacher_id: string
            p_student_id: string | null
            p_buyer_name: string | null
            p_sale_date: string | null
            p_amount_paid: number | null
            p_note: string | null
            p_lines: Json
          }
          Returns: Json
        }
      delete_my_teacher_account: {
          Args: Record<PropertyKey, never>
          Returns: Json
        }
      enrolment_page_by_token: {
          Args: {
            p_token: string
          }
          Returns: Json
        }
      enrolment_resolve_token: {
          Args: {
            p_token: string
          }
          Returns: {
            teacher_id: string
          }[]
        }
      enrolment_submit_by_token: {
          Args: {
            p_token: string
            p_student_name: string
            p_guardian_phone: string
            p_group_id: string
            p_wants_trial?: boolean
            p_note?: string
            p_honeypot?: string
          }
          Returns: Json
        }
      exam_attempt_deadline: {
          Args: {
            p_started_at: string
            p_duration_minutes: number
            p_ends_at: string
          }
          Returns: string
        }
      exam_info_by_token: {
          Args: {
            p_token: string
          }
          Returns: Json
        }
      exam_resolve_token: {
          Args: {
            p_token: string
          }
          Returns: {
            token_id: string
            exam_id: string
            teacher_id: string
            assessment_id: string
            group_id: string
          }[]
        }
      exam_start_attempt: {
          Args: {
            p_token: string
            p_student_code: string
          }
          Returns: Json
        }
      exam_submit_attempt: {
          Args: {
            p_token: string
            p_attempt_id: string
            p_answers: Json
          }
          Returns: Json
        }
      generate_group_sessions: {
          Args: {
            p_teacher_id: string
            p_group_id: string
            p_month: string
          }
          Returns: number
        }
      generate_public_code: {
          Args: Record<PropertyKey, never>
          Returns: string
        }
      generate_teacher_sessions: {
          Args: {
            p_teacher_id: string
            p_months: string[]
          }
          Returns: number
        }
      get_teacher_whatsapp_token_internal: {
          Args: {
            p_teacher_id: string
          }
          Returns: string
        }
      is_platform_admin: {
          Args: Record<PropertyKey, never>
          Returns: boolean
        }
      is_teacher_member: {
          Args: {
            p_teacher_id: string
          }
          Returns: boolean
        }
      is_teacher_owner: {
          Args: {
            p_teacher_id: string
          }
          Returns: boolean
        }
      member_has_permission: {
          Args: {
            p_teacher_id: string
            p_perm: string
          }
          Returns: boolean
        }
      my_platform_admin: {
          Args: Record<PropertyKey, never>
          Returns: boolean
        }
      next_receipt_no: {
          Args: {
            p_teacher_id: string
            p_date?: string
          }
          Returns: string
        }
      owns_storage_prefix: {
          Args: {
            p_name: string
          }
          Returns: boolean
        }
      payment_proof_upload_allowed: {
          Args: {
            p_path: string
          }
          Returns: boolean
        }
      platform_overview: {
          Args: Record<PropertyKey, never>
          Returns: Json
        }
      portal_account_apply_password: {
          Args: {
            p_teacher_id: string
            p_role: string
            p_student_id: string
            p_guardian_id: string
            p_username: string
            p_password: string
          }
          Returns: string
        }
      portal_account_change_password: {
          Args: {
            p_session_token: string
            p_old_password: string
            p_new_password: string
          }
          Returns: Json
        }
      portal_account_claim_guardian: {
          Args: {
            p_token: string
            p_student_id: string
            p_password: string
          }
          Returns: Json
        }
      portal_account_claim_student: {
          Args: {
            p_token: string
            p_password: string
          }
          Returns: Json
        }
      portal_account_revoke_sessions: {
          Args: {
            p_account_id: string
          }
          Returns: Json
        }
      portal_account_set_active: {
          Args: {
            p_account_id: string
            p_active: boolean
          }
          Returns: Json
        }
      portal_account_upsert: {
          Args: {
            p_teacher_id: string
            p_role: string
            p_target_id: string
            p_password: string
          }
          Returns: Json
        }
      portal_build_overview: {
          Args: {
            p_student_id: string
          }
          Returns: Json
        }
      portal_confirm_payment_proof: {
          Args: {
            p_token: string
            p_proof_id: string
          }
          Returns: Json
        }
      portal_create_payment_proof: {
          Args: {
            p_token: string
            p_student_id: string
            p_amount: number
            p_method: Database["public"]["Enums"]["payment_method"]
            p_file_ext: string
            p_invoice_id?: string
          }
          Returns: Json
        }
      portal_delete_payment_proof: {
          Args: {
            p_token: string
            p_proof_id: string
          }
          Returns: Json
        }
      portal_list_guardian_notifications: {
          Args: {
            p_token: string
            p_student_id: string
          }
          Returns: Json
        }
      portal_list_payment_proofs: {
          Args: {
            p_token: string
            p_student_id: string
          }
          Returns: Json
        }
      portal_login: {
          Args: {
            p_username: string
            p_password: string
          }
          Returns: Json
        }
      portal_logout: {
          Args: {
            p_session_token: string
          }
          Returns: Json
        }
      portal_mark_notifications_read: {
          Args: {
            p_token: string
            p_student_id: string
            p_ids?: string[]
          }
          Returns: Json
        }
      portal_norm_phone: {
          Args: {
            p_phone: string
          }
          Returns: string
        }
      portal_overview_by_token: {
          Args: {
            p_token: string
            p_student_id: string
          }
          Returns: Json
        }
      portal_push_status: {
          Args: {
            p_token: string
            p_student_id: string
            p_endpoint: string
          }
          Returns: Json
        }
      portal_push_subscribe: {
          Args: {
            p_token: string
            p_student_id: string
            p_endpoint: string
            p_p256dh: string
            p_auth: string
            p_user_agent?: string
          }
          Returns: Json
        }
      portal_push_unsubscribe: {
          Args: {
            p_token: string
            p_student_id: string
            p_endpoint: string
          }
          Returns: Json
        }
      portal_resolve_session_account: {
          Args: {
            p_session_token: string
          }
          Returns: Database["public"]["Tables"]["portal_accounts"]["Row"]
        }
      portal_session_students: {
          Args: {
            p_session_token: string
          }
          Returns: Json
        }
      portal_validate_token: {
          Args: {
            p_token: string
            p_student_id: string
          }
          Returns: Database["public"]["Tables"]["guardian_access_tokens"]["Row"]
        }
      push_centre_name: {
          Args: {
            p_teacher_id: string
          }
          Returns: string
        }
      push_dispatch: {
          Args: {
            p_title: string
            p_body: string
            p_student_id: string
            p_tag?: string
            p_url?: string
          }
          Returns: undefined
        }
      push_dispatch_teacher: {
          Args: {
            p_title: string
            p_body: string
            p_teacher_id: string
            p_tag?: string
            p_url?: string
          }
          Returns: undefined
        }
      push_send_daily_digests: {
          Args: Record<PropertyKey, never>
          Returns: number
        }
      report_client_error: {
          Args: {
            p_teacher_id: string | null
            p_kind: string
            p_message: string
            p_stack: string | null
            p_route: string | null
            p_app_version: string | null
          }
          Returns: Json
        }
      resolve_whatsapp_channel_internal: {
          Args: {
            p_user_id: string
          }
          Returns: {
            teacher_id: string
            phone_number_id: string
            template_name: string
            template_language: string
            access_token: string
          }[]
        }
      set_teacher_whatsapp_token: {
          Args: {
            p_teacher_id: string
            p_token: string
          }
          Returns: undefined
        }
      student_portal_build_overview: {
          Args: {
            p_student_id: string
          }
          Returns: Json
        }
      student_portal_overview_by_token: {
          Args: {
            p_token: string
          }
          Returns: Json
        }
      student_portal_push_status: {
          Args: {
            p_token: string
            p_endpoint: string
          }
          Returns: Json
        }
      student_portal_push_subscribe: {
          Args: {
            p_token: string
            p_endpoint: string
            p_p256dh: string
            p_auth: string
            p_user_agent?: string
          }
          Returns: Json
        }
      student_portal_push_unsubscribe: {
          Args: {
            p_token: string
            p_endpoint: string
          }
          Returns: Json
        }
      student_portal_resolve_token: {
          Args: {
            p_token: string
          }
          Returns: {
            token_id: string
            teacher_id: string
            student_id: string
          }[]
        }
      submit_teacher_feedback: {
          Args: {
            p_teacher_id: string
            p_kind: string
            p_body: string
          }
          Returns: Json
        }
      teacher_id_claimable: {
          Args: {
            p_id: string
          }
          Returns: boolean
        }
    }
    Enums: {
      assessment_type: "exam" | "homework"
      attendance_status: "p" | "a" | "l" | "m"
      billing_type: "monthly_fixed" | "per_session_prepaid" | "per_session_attended" | "weekly_package"
      exam_attempt_status: "in_progress" | "submitted" | "expired"
      guardian_notification_kind: "arrived" | "left"
      invoice_line_type: "base" | "discount" | "adjustment"
      member_role: "owner" | "assistant"
      member_status: "invited" | "active" | "suspended"
      online_exam_status: "draft" | "published" | "closed"
      payment_method: "cash" | "vodafone_cash" | "instapay" | "bank_transfer"
      payment_proof_status: "pending" | "approved" | "rejected"
      push_delivery_status: "sent" | "failed" | "gone" | "skipped_inactive"
      push_subscriber_kind: "teacher" | "guardian" | "student"
      question_type: "mcq" | "essay"
      session_kind: "regular" | "extra" | "moved"
      session_status: "scheduled" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
