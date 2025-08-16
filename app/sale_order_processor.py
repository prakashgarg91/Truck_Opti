import pandas as pd
import logging
from datetime import datetime
from app.models import db, SaleOrder, SaleOrderItem, SaleOrderBatch
from app.core.error_monitor import capture_error
from app.multi_order_optimizer import MultiOrderOptimizer

class SaleOrderProcessor:
    def __init__(self):
        self.logger = logging.getLogger('sale_order_processing')
        self.logger.setLevel(logging.INFO)
        
        # Ensure comprehensive logging
        file_handler = logging.FileHandler("sale_order_processing.log", mode='a')
        formatter = logging.Formatter('%(asctime)s - %(levelname)s: %(message)s')
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)
    
    def validate_sale_order_file(self, file):
        """
        Validate sale order CSV file with comprehensive validation and error reporting
        
        Args:
            file (FileStorage): Uploaded CSV file
        
        Returns:
            pandas.DataFrame: Validated and cleaned DataFrame
        
        Raises:
            ValueError: With detailed error messages about file validation issues
        """
        try:
            # Read CSV with robust parsing
            df = pd.read_csv(file, dtype=str, encoding='utf-8', na_filter=False)
            
            # Check if file is empty
            if df.empty:
                raise ValueError("The uploaded file is empty. Please upload a valid CSV file.")
            
            # Required columns with validation
            required_columns = [
                'sale_order_number', 
                'carton_name', 
                'carton_code', 
                'quantity', 
                'customer_name', 
                'delivery_address'
            ]
            
            # Check for missing columns
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
            
            # Sanitize and validate data
            df['sale_order_number'] = df['sale_order_number'].str.strip()
            
            # Convert quantity to numeric, handling errors
            df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce')
            
            # Remove invalid rows
            df = df[
                (df['sale_order_number'] != '') & 
                (df['quantity'] > 0)
            ]
            
            if df.empty:
                raise ValueError("No valid sale order data found in the file. Ensure quantity is a valid positive number.")
            
            return df
        
        except pd.errors.EmptyDataError:
            raise ValueError("Unable to read the file. Please check the file format and try again.")
        except pd.errors.ParserError as e:
            self.logger.error(f"CSV parsing error: {str(e)}")
            raise ValueError(f"Unable to parse the CSV file. Error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Sale order file validation error: {str(e)}")
            capture_error(
                e, 
                component='Sale Order File Validation', 
                error_level='CRITICAL'
            )
            raise
    
    def process_sale_order_file(self, file, batch_name, optimization_mode='cost_saving', enable_consolidation=True):
        """
        Enhanced sale order file processing with robust error handling
        
        Args:
            file (FileStorage): Uploaded CSV file
            batch_name (str): Unique batch identifier
            optimization_mode (str): Optimization strategy
            enable_consolidation (bool): Multi-order consolidation flag
        
        Returns:
            dict: Comprehensive processing results
        
        Raises:
            ValueError: With specific details about processing failures
        """
        """
        Process sale order file with enhanced error handling and optimization
        
        Args:
            file (FileStorage): Uploaded CSV file
            batch_name (str): Name of the processing batch
            optimization_mode (str): Optimization strategy
            enable_consolidation (bool): Flag to enable order consolidation
        
        Returns:
            dict: Processing results with batch details
        """
        try:
            # Validate file
            df = self.validate_sale_order_file(file)
            
            # Create batch
            batch = SaleOrderBatch(
                batch_name=batch_name,
                total_orders=df['sale_order_number'].nunique(),
                optimization_mode=optimization_mode,
                status='processing'
            )
            db.session.add(batch)
            db.session.flush()  # Get batch ID without committing
            
            # Track processing statistics
            processed_orders = 0
            failed_orders = 0
            
            # Group by sale order number for processing
            order_groups = df.groupby('sale_order_number')
            
            for order_num, order_data in order_groups:
                try:
                    # Create sale order
                    sale_order = SaleOrder(
                        sale_order_number=str(order_num),
                        batch_id=batch.id,
                        status='pending'
                    )
                    db.session.add(sale_order)
                    db.session.flush()
                    
                    # Create sale order items
                    for _, row in order_data.iterrows():
                        sale_order_item = SaleOrderItem(
                            sale_order_id=sale_order.id,
                            carton_name=row['carton_name'],
                            carton_code=row['carton_code'],
                            quantity=int(row['quantity']),
                            customer_name=row['customer_name'],
                            delivery_address=row['delivery_address']
                        )
                        db.session.add(sale_order_item)
                    
                    # Mark sale order as processed
                    sale_order.status = 'processed'
                    processed_orders += 1
                
                except Exception as order_error:
                    # Handle individual order processing errors
                    self.logger.error(f"Error processing order {order_num}: {str(order_error)}")
                    sale_order.status = 'failed'
                    sale_order.processing_notes = str(order_error)
                    failed_orders += 1
                    capture_error(
                        order_error, 
                        component='Sale Order Processing', 
                        error_level='HIGH',
                        context={'order_number': order_num}
                    )
            
            # Optimize multi-order processing if enabled
            if enable_consolidation:
                optimizer = MultiOrderOptimizer()
                sale_orders = SaleOrder.query.filter_by(batch_id=batch.id, status='processed').all()
                
                if sale_orders:
                    optimizer.optimize_batch(
                        sale_orders, 
                        optimization_mode=optimization_mode
                    )
            
            # Update batch status
            batch.processed_orders = processed_orders
            batch.failed_orders = failed_orders
            batch.status = 'completed' if failed_orders == 0 else 'partial'
            
            db.session.commit()
            
            return {
                'batch_id': batch.id,
                'total_orders': len(order_groups),
                'processed_orders': processed_orders,
                'failed_orders': failed_orders,
                'status': batch.status
            }
        
        except Exception as e:
            db.session.rollback()
            self.self.logger.critical(f"Catastrophic sale order processing error: {str(e)}")
            
            # Enhanced error context logging
            error_context = {
                'batch_name': batch_name,
                'optimization_mode': optimization_mode,
                'enable_consolidation': enable_consolidation,
                'error_type': type(e).__name__,
                'error_details': str(e)
            }
            
            # More detailed error capture
            capture_error(
                e, 
                component='Sale Order Batch Processing', 
                error_level='CRITICAL',
                context=error_context
            )
            capture_error(
                e, 
                component='Sale Order Batch Processing', 
                error_level='CRITICAL'
            )
            raise