/**
 * Поле формы: подпись сверху, поле, текст ошибки/подсказки ПОД полем
 * (не впритык к кнопкам). Ошибка помечает поле aria-invalid и связывается
 * с ним через aria-describedby.
 */
import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

interface CommonProps {
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

type InputProps = CommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof CommonProps> & { as?: 'input' };
type TextareaProps = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof CommonProps> & { as: 'textarea' };

export function Field(props: InputProps | TextareaProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = props.error ? errId : props.hint ? hintId : undefined;
  const invalid = props.error ? true : undefined;

  let control: ReactNode;
  if (props.as === 'textarea') {
    const { label: _l, error: _e, hint: _h, className: _c, as: _a, id: _i, ...rest } = props;
    control = (
      <textarea
        className="ui-input ui-textarea"
        {...rest}
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
    );
  } else {
    const { label: _l, error: _e, hint: _h, className: _c, as: _a, id: _i, ...rest } = props;
    control = (
      <input
        className="ui-input"
        {...rest}
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
    );
  }

  return (
    <div className={['ui-field', props.className ?? ''].filter(Boolean).join(' ')}>
      {props.label && (
        <label htmlFor={id} className="ui-field-label">
          {props.label}
        </label>
      )}
      {control}
      {props.error ? (
        <p id={errId} className="ui-field-error" role="alert">
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p id={hintId} className="ui-field-hint">
            {props.hint}
          </p>
        )
      )}
    </div>
  );
}
